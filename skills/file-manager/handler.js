/**
 * File Manager Skill Handler
 *
 * Provides sandboxed file operations within the /data/ directory.
 * Supports read, write, list, and delete actions.
 * All paths are resolved relative to /data/ and directory traversal is blocked.
 */

import { readFile, writeFile, readdir, unlink, rm, mkdir, stat } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';

const SANDBOX_ROOT = '/data';

/**
 * Resolve a user-supplied path safely within the sandbox.
 * Prevents directory traversal attacks (e.g., ../../etc/passwd).
 *
 * @param {string} userPath - The path provided by the user
 * @returns {string} Absolute path guaranteed to be inside SANDBOX_ROOT
 * @throws {Error} If the resolved path escapes the sandbox
 */
function safePath(userPath) {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path is required and must be a non-empty string.');
  }

  // Normalize and resolve within sandbox
  const cleaned = userPath.replace(/\\/g, '/');
  const resolved = resolve(SANDBOX_ROOT, cleaned);
  const rel = relative(SANDBOX_ROOT, resolved);

  // If the relative path starts with '..' it escapes the sandbox
  if (rel.startsWith('..') || resolve(SANDBOX_ROOT, rel) !== resolved) {
    throw new Error(`Access denied: path "${userPath}" resolves outside the sandbox.`);
  }

  return resolved;
}

/**
 * Read a file and return its contents.
 * @param {string} filePath - Absolute sandboxed path
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleRead(filePath) {
  const stats = await stat(filePath);

  if (stats.isDirectory()) {
    return {
      result: `Error: "${filePath}" is a directory, not a file. Use action "list" to view directory contents.`,
      metadata: { success: false, error: 'IS_DIRECTORY' }
    };
  }

  // Limit read size to 10 MB to prevent memory issues
  const MAX_SIZE = 10 * 1024 * 1024;
  if (stats.size > MAX_SIZE) {
    return {
      result: `Error: File is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). Maximum readable size is 10 MB.`,
      metadata: { success: false, error: 'FILE_TOO_LARGE', sizeBytes: stats.size }
    };
  }

  const content = await readFile(filePath, 'utf-8');
  return {
    result: content,
    metadata: {
      success: true,
      action: 'read',
      path: filePath,
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString()
    }
  };
}

/**
 * Write content to a file, creating parent directories as needed.
 * @param {string} filePath - Absolute sandboxed path
 * @param {string} content - Content to write
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleWrite(filePath, content) {
  if (content === undefined || content === null) {
    return {
      result: 'Error: content parameter is required for the write action.',
      metadata: { success: false, error: 'MISSING_CONTENT' }
    };
  }

  // Ensure parent directory exists
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const data = String(content);
  await writeFile(filePath, data, 'utf-8');

  return {
    result: `File written successfully: ${filePath} (${data.length} characters)`,
    metadata: {
      success: true,
      action: 'write',
      path: filePath,
      sizeBytes: Buffer.byteLength(data, 'utf-8'),
      characters: data.length
    }
  };
}

/**
 * List directory contents with file type and size information.
 * @param {string} dirPath - Absolute sandboxed path
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleList(dirPath) {
  const stats = await stat(dirPath);

  if (!stats.isDirectory()) {
    return {
      result: `Error: "${dirPath}" is a file, not a directory. Use action "read" to view file contents.`,
      metadata: { success: false, error: 'NOT_DIRECTORY' }
    };
  }

  const entries = await readdir(dirPath, { withFileTypes: true });

  if (entries.length === 0) {
    return {
      result: `Directory is empty: ${dirPath}`,
      metadata: { success: true, action: 'list', path: dirPath, entryCount: 0, entries: [] }
    };
  }

  const entryDetails = [];
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);
    try {
      const entryStat = await stat(entryPath);
      entryDetails.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: entry.isDirectory() ? null : entryStat.size,
        lastModified: entryStat.mtime.toISOString()
      });
    } catch {
      entryDetails.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: null,
        lastModified: null
      });
    }
  }

  const formatted = entryDetails
    .map(e => {
      const icon = e.type === 'directory' ? '[DIR] ' : '      ';
      const size = e.sizeBytes !== null ? ` (${e.sizeBytes} bytes)` : '';
      return `${icon}${e.name}${size}`;
    })
    .join('\n');

  return {
    result: `Contents of ${dirPath}:\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      path: dirPath,
      entryCount: entryDetails.length,
      entries: entryDetails
    }
  };
}

/**
 * Delete a file or directory (recursively).
 * @param {string} targetPath - Absolute sandboxed path
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleDelete(targetPath) {
  // Prevent deleting the sandbox root itself
  if (resolve(targetPath) === resolve(SANDBOX_ROOT)) {
    return {
      result: 'Error: Cannot delete the root sandbox directory.',
      metadata: { success: false, error: 'CANNOT_DELETE_ROOT' }
    };
  }

  const stats = await stat(targetPath);
  const isDir = stats.isDirectory();

  if (isDir) {
    await rm(targetPath, { recursive: true, force: true });
  } else {
    await unlink(targetPath);
  }

  return {
    result: `Deleted ${isDir ? 'directory' : 'file'}: ${targetPath}`,
    metadata: {
      success: true,
      action: 'delete',
      path: targetPath,
      type: isDir ? 'directory' : 'file'
    }
  };
}

/**
 * Execute a file management operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: read, write, list, delete
 * @param {string} params.path - File/directory path relative to /data/
 * @param {string} [params.content] - Content for the write action
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, path: userPath, content } = params;

  // Validate action
  const validActions = ['read', 'write', 'list', 'delete'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  // Resolve and validate path
  let resolvedPath;
  try {
    resolvedPath = safePath(userPath);
  } catch (error) {
    return {
      result: `Error: ${error.message}`,
      metadata: { success: false, error: 'PATH_VALIDATION_FAILED', detail: error.message }
    };
  }

  // Ensure the sandbox root directory exists
  try {
    await mkdir(SANDBOX_ROOT, { recursive: true });
  } catch {
    // Directory may already exist, ignore
  }

  try {
    switch (action) {
      case 'read':
        return await handleRead(resolvedPath);
      case 'write':
        return await handleWrite(resolvedPath, content);
      case 'list':
        return await handleList(resolvedPath);
      case 'delete':
        return await handleDelete(resolvedPath);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'UNKNOWN_ACTION' }
        };
    }
  } catch (error) {
    // Handle common filesystem errors with helpful messages
    if (error.code === 'ENOENT') {
      return {
        result: `Error: Path not found: "${userPath}". The file or directory does not exist.`,
        metadata: { success: false, error: 'NOT_FOUND', path: resolvedPath, code: 'ENOENT' }
      };
    }
    if (error.code === 'EACCES') {
      return {
        result: `Error: Permission denied for path: "${userPath}".`,
        metadata: { success: false, error: 'PERMISSION_DENIED', path: resolvedPath, code: 'EACCES' }
      };
    }

    return {
      result: `Error during ${action} operation: ${error.message}`,
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message, code: error.code }
    };
  }
}
