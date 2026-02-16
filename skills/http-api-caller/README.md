# HTTP / API Caller

Make HTTP requests to external APIs with full control over method, headers, body, query parameters, timeout, and retry policy.

## Features

- **HTTP Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Headers**: Custom request headers as key-value pairs
- **Body**: JSON objects or raw text request bodies
- **Query Parameters**: Automatic URL query parameter encoding
- **Authentication**: Bearer token and Basic auth support
- **Timeout**: Configurable request timeout (default 30s, max 60s)
- **Retries**: Automatic retry with exponential backoff (max 3 retries)
- **Response Parsing**: Automatic JSON detection with text fallback

## Security

This skill includes multiple layers of security to prevent abuse:

- **HTTPS Only**: All requests must use `https://`. Requests using `http://`, `file://`, `ftp://`, or any other protocol are rejected.
- **SSRF Protection**: Requests to private and internal IP ranges are blocked:
  - `127.0.0.0/8` (loopback)
  - `10.0.0.0/8` (private)
  - `172.16.0.0/12` (private)
  - `192.168.0.0/16` (private)
  - `169.254.0.0/16` (link-local)
  - `localhost` and IPv6 loopback (`::1`)
- **Header Redaction**: Sensitive headers (`Authorization`, `Cookie`, `X-API-Key`, etc.) are automatically redacted in response metadata and logs.
- **Timeout Enforcement**: Maximum timeout of 60 seconds to prevent resource exhaustion.

## Parameters

| Parameter     | Type   | Required | Default | Description                                                      |
|---------------|--------|----------|---------|------------------------------------------------------------------|
| `url`         | string | Yes      | -       | The request URL (must be `https://`)                             |
| `method`      | string | No       | `GET`   | HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS        |
| `headers`     | object | No       | `{}`    | Request headers as key-value pairs                               |
| `body`        | any    | No       | -       | Request body (object for JSON, string for text)                  |
| `queryParams` | object | No       | -       | URL query parameters as key-value pairs                          |
| `timeout`     | number | No       | `30000` | Request timeout in milliseconds (max: 60000)                    |
| `retries`     | number | No       | `0`     | Number of retries on failure (max: 3)                            |
| `auth`        | object | No       | -       | Auth config: `{ type: 'bearer'\|'basic', token?, username?, password? }` |

## Usage Examples

### Simple GET request

```json
{
  "url": "https://api.example.com/users"
}
```

### POST with JSON body

```json
{
  "url": "https://api.example.com/users",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```

### Authenticated request with query parameters

```json
{
  "url": "https://api.example.com/search",
  "queryParams": {
    "q": "hello world",
    "limit": "10"
  },
  "auth": {
    "type": "bearer",
    "token": "your-api-token"
  }
}
```

### Request with retries and timeout

```json
{
  "url": "https://api.example.com/data",
  "timeout": 10000,
  "retries": 2
}
```

## Error Codes

| Code             | Description                                          |
|------------------|------------------------------------------------------|
| `INVALID_URL`    | URL is missing, malformed, or uses a non-HTTPS scheme |
| `BLOCKED_URL`    | URL targets a private/internal IP address            |
| `INVALID_METHOD` | HTTP method is not in the allowed list               |
| `TIMEOUT`        | Request exceeded the configured timeout              |
| `HTTP_ERROR`     | Server returned a non-2xx status code                |
| `NETWORK_ERROR`  | Network-level failure (DNS, connection refused, etc.)|

## Response Format

```json
{
  "result": "Response body as string (JSON pretty-printed or raw text)",
  "metadata": {
    "success": true,
    "statusCode": 200,
    "statusText": "OK",
    "method": "GET",
    "url": "https://api.example.com/users",
    "responseFormat": "json",
    "contentType": "application/json",
    "elapsed": 245,
    "attempt": 1,
    "totalAttempts": 1,
    "requestHeaders": { "Authorization": "[REDACTED]" },
    "responseHeaders": { "content-type": "application/json" }
  }
}
```
