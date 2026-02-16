/**
 * PDF Reader Skill Handler
 *
 * Extracts text from PDF files using raw buffer parsing.
 * No external npm dependencies required -- works with Node.js built-in modules only.
 *
 * Approach:
 *   1. Read the file as a binary buffer.
 *   2. Locate stream objects and decompress them (FlateDecode via node:zlib).
 *   3. Find text between BT (Begin Text) and ET (End Text) markers.
 *   4. Parse text-showing operators: Tj, TJ, ', "
 *   5. Assemble the extracted text into a readable string.
 */

import { readFile, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { inflateSync, unzipSync } from 'node:zlib';
import { resolve } from 'node:path';

/**
 * Attempt to decompress a PDF stream using FlateDecode (zlib deflate).
 * Returns the raw data if decompression fails (stream may not be compressed).
 *
 * @param {Buffer} streamData - The raw stream data
 * @returns {Buffer} Decompressed or original data
 */
function decompressStream(streamData) {
  try {
    return inflateSync(streamData);
  } catch {
    // Try raw deflate (no header)
    try {
      return inflateSync(streamData, { finishFlush: constants.Z_SYNC_FLUSH });
    } catch {
      // Return as-is if decompression fails entirely
      return streamData;
    }
  }
}

/**
 * Extract all stream objects from the raw PDF buffer.
 * Streams are delimited by "stream\r\n" or "stream\n" ... "endstream".
 *
 * @param {Buffer} buffer - Raw PDF file buffer
 * @returns {Buffer[]} Array of stream data buffers
 */
function extractStreams(buffer) {
  const streams = [];
  const bufStr = buffer.toString('binary');

  // Match "stream" keyword followed by content until "endstream"
  let searchStart = 0;

  while (true) {
    const streamIdx = bufStr.indexOf('stream', searchStart);
    if (streamIdx === -1) break;

    // The actual stream data starts after "stream\r\n" or "stream\n"
    let dataStart = streamIdx + 6; // length of "stream"
    if (bufStr[dataStart] === '\r' && bufStr[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (bufStr[dataStart] === '\n') {
      dataStart += 1;
    } else {
      // Not a real stream marker, skip
      searchStart = streamIdx + 6;
      continue;
    }

    const endIdx = bufStr.indexOf('endstream', dataStart);
    if (endIdx === -1) {
      searchStart = dataStart;
      continue;
    }

    // Trim trailing whitespace before endstream
    let dataEnd = endIdx;
    if (dataEnd > dataStart && bufStr[dataEnd - 1] === '\n') dataEnd--;
    if (dataEnd > dataStart && bufStr[dataEnd - 1] === '\r') dataEnd--;

    const streamData = buffer.subarray(dataStart, dataEnd);
    streams.push(streamData);

    searchStart = endIdx + 9; // length of "endstream"
  }

  return streams;
}

/**
 * Decode a PDF string literal: handle escape sequences and octal codes.
 * @param {string} str - Raw PDF string (without outer parentheses)
 * @returns {string}
 */
function decodePDFString(str) {
  let result = '';
  let i = 0;

  while (i < str.length) {
    if (str[i] === '\\') {
      i++;
      if (i >= str.length) break;

      switch (str[i]) {
        case 'n': result += '\n'; break;
        case 'r': result += '\r'; break;
        case 't': result += '\t'; break;
        case 'b': result += '\b'; break;
        case 'f': result += '\f'; break;
        case '(': result += '('; break;
        case ')': result += ')'; break;
        case '\\': result += '\\'; break;
        default:
          // Check for octal escape: \NNN
          if (str[i] >= '0' && str[i] <= '7') {
            let octal = str[i];
            if (i + 1 < str.length && str[i + 1] >= '0' && str[i + 1] <= '7') {
              octal += str[++i];
              if (i + 1 < str.length && str[i + 1] >= '0' && str[i + 1] <= '7') {
                octal += str[++i];
              }
            }
            result += String.fromCharCode(parseInt(octal, 8));
          } else {
            result += str[i];
          }
      }
    } else {
      result += str[i];
    }
    i++;
  }

  return result;
}

/**
 * Extract text from a BT...ET text block.
 * Parses PDF text operators: Tj, TJ, ', "
 *
 * @param {string} textBlock - Content between BT and ET
 * @returns {string} Extracted text
 */
function extractTextFromBlock(textBlock) {
  const parts = [];

  // Match Tj operator: (string) Tj
  const tjPattern = /\(([^)]*(?:\\\)[^)]*)*)\)\s*Tj/g;
  let match;

  while ((match = tjPattern.exec(textBlock)) !== null) {
    parts.push(decodePDFString(match[1]));
  }

  // Match TJ operator: [(string) num (string) ...] TJ
  const tjArrayPattern = /\[([\s\S]*?)\]\s*TJ/g;
  while ((match = tjArrayPattern.exec(textBlock)) !== null) {
    const arrayContent = match[1];
    // Extract string literals from the array
    const stringPattern = /\(([^)]*(?:\\\)[^)]*)*)\)/g;
    let strMatch;
    while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
      parts.push(decodePDFString(strMatch[1]));
    }
  }

  // Match ' operator (move to next line and show text): (string) '
  const tickPattern = /\(([^)]*(?:\\\)[^)]*)*)\)\s*'/g;
  while ((match = tickPattern.exec(textBlock)) !== null) {
    parts.push('\n' + decodePDFString(match[1]));
  }

  // Match " operator: aw ac (string) "
  const dblQuotePattern = /[\d.\-]+\s+[\d.\-]+\s+\(([^)]*(?:\\\)[^)]*)*)\)\s*"/g;
  while ((match = dblQuotePattern.exec(textBlock)) !== null) {
    parts.push('\n' + decodePDFString(match[1]));
  }

  return parts.join('');
}

/**
 * Extract text from decoded stream content by finding BT...ET blocks.
 * @param {string} content - Decoded stream as a string
 * @returns {string} Extracted text
 */
function extractTextFromContent(content) {
  const textParts = [];
  let searchStart = 0;

  while (true) {
    const btIdx = content.indexOf('BT', searchStart);
    if (btIdx === -1) break;

    const etIdx = content.indexOf('ET', btIdx + 2);
    if (etIdx === -1) break;

    const textBlock = content.substring(btIdx + 2, etIdx);
    const extracted = extractTextFromBlock(textBlock);

    if (extracted.trim().length > 0) {
      textParts.push(extracted.trim());
    }

    searchStart = etIdx + 2;
  }

  return textParts.join('\n');
}

/**
 * Extract basic metadata from the PDF (title, author, page count, etc.).
 * @param {string} bufStr - PDF content as binary string
 * @returns {Object} Metadata object
 */
function extractMetadata(bufStr) {
  const metadata = {};

  // PDF version
  const versionMatch = bufStr.match(/%PDF-(\d+\.\d+)/);
  if (versionMatch) metadata.pdfVersion = versionMatch[1];

  // Page count: count "/Type /Page" entries (excluding "/Type /Pages")
  const pageMatches = bufStr.match(/\/Type\s*\/Page(?!\s*s)/g);
  metadata.estimatedPageCount = pageMatches ? pageMatches.length : 0;

  // Title
  const titleMatch = bufStr.match(/\/Title\s*\(([^)]*)\)/);
  if (titleMatch) metadata.title = decodePDFString(titleMatch[1]);

  // Author
  const authorMatch = bufStr.match(/\/Author\s*\(([^)]*)\)/);
  if (authorMatch) metadata.author = decodePDFString(authorMatch[1]);

  // Creator
  const creatorMatch = bufStr.match(/\/Creator\s*\(([^)]*)\)/);
  if (creatorMatch) metadata.creator = decodePDFString(creatorMatch[1]);

  // Producer
  const producerMatch = bufStr.match(/\/Producer\s*\(([^)]*)\)/);
  if (producerMatch) metadata.producer = decodePDFString(producerMatch[1]);

  return metadata;
}

/**
 * Execute the PDF reader to extract text from a file.
 *
 * @param {Object} params
 * @param {string} params.filePath - Path to the PDF file
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { filePath } = params;

  if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
    return {
      result: 'Error: filePath is required and must be a non-empty string pointing to a PDF file.',
      metadata: { success: false, error: 'INVALID_FILE_PATH' }
    };
  }

  const resolvedPath = resolve(filePath.trim());

  // Check if file exists
  try {
    await access(resolvedPath, constants.R_OK);
  } catch {
    return {
      result: `Error: File not found or not readable: "${resolvedPath}".\n\nPlease verify:\n  - The file path is correct\n  - The file exists\n  - The process has read permissions`,
      metadata: { success: false, error: 'FILE_NOT_FOUND', path: resolvedPath }
    };
  }

  // Check file size
  const fileStats = await stat(resolvedPath);
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  if (fileStats.size > MAX_SIZE) {
    return {
      result: `Error: PDF file is too large (${(fileStats.size / 1024 / 1024).toFixed(2)} MB). Maximum supported size is 50 MB.`,
      metadata: { success: false, error: 'FILE_TOO_LARGE', sizeBytes: fileStats.size, path: resolvedPath }
    };
  }

  try {
    // Read the file as a buffer
    const buffer = await readFile(resolvedPath);
    const bufStr = buffer.toString('binary');

    // Verify it's a PDF
    if (!bufStr.startsWith('%PDF')) {
      return {
        result: `Error: File does not appear to be a valid PDF (missing %PDF header): "${resolvedPath}"`,
        metadata: { success: false, error: 'NOT_A_PDF', path: resolvedPath }
      };
    }

    // Extract metadata
    const metadata = extractMetadata(bufStr);
    metadata.filePath = resolvedPath;
    metadata.fileSizeBytes = fileStats.size;

    // Extract and process streams
    const streams = extractStreams(buffer);
    const allText = [];

    for (const streamData of streams) {
      try {
        const decompressed = decompressStream(streamData);
        const content = decompressed.toString('latin1');

        // Only process streams that contain text operators
        if (content.includes('BT') && content.includes('ET')) {
          const text = extractTextFromContent(content);
          if (text.trim().length > 0) {
            allText.push(text);
          }
        }
      } catch {
        // Skip streams that can't be processed
        continue;
      }
    }

    // Also try to extract text directly from the buffer string
    // (some PDFs have uncompressed text)
    if (bufStr.includes('BT') && bufStr.includes('ET')) {
      const directText = extractTextFromContent(bufStr);
      if (directText.trim().length > 0) {
        allText.push(directText);
      }
    }

    // Deduplicate text sections (direct extraction may overlap with stream extraction)
    const uniqueTexts = [...new Set(allText.map(t => t.trim()))].filter(t => t.length > 0);
    const fullText = uniqueTexts.join('\n\n---\n\n');

    if (fullText.trim().length === 0) {
      return {
        result: `PDF file was read successfully but no extractable text was found.\n` +
          `This may be a scanned/image-only PDF that requires OCR.\n` +
          `File: ${resolvedPath}\n` +
          `Size: ${(fileStats.size / 1024).toFixed(2)} KB\n` +
          `Estimated pages: ${metadata.estimatedPageCount}`,
        metadata: {
          success: true,
          warning: 'NO_TEXT_EXTRACTED',
          path: resolvedPath,
          ...metadata,
          streamCount: streams.length,
          extractedText: ''
        }
      };
    }

    // Build a summary header
    const header = [
      `PDF Text Extraction: ${resolvedPath}`,
      `Size: ${(fileStats.size / 1024).toFixed(2)} KB`,
      `Estimated pages: ${metadata.estimatedPageCount}`,
      metadata.title ? `Title: ${metadata.title}` : null,
      metadata.author ? `Author: ${metadata.author}` : null,
      `Characters extracted: ${fullText.length}`,
      `Streams processed: ${streams.length}`,
      '---'
    ].filter(Boolean).join('\n');

    return {
      result: `${header}\n\n${fullText}`,
      metadata: {
        success: true,
        path: resolvedPath,
        ...metadata,
        streamCount: streams.length,
        textLength: fullText.length,
        sectionCount: uniqueTexts.length
      }
    };
  } catch (error) {
    return {
      result: `Error reading PDF file: ${error.message}\n\nFile: ${resolvedPath}`,
      metadata: {
        success: false,
        error: 'READ_ERROR',
        errorMessage: error.message,
        path: resolvedPath
      }
    };
  }
}
