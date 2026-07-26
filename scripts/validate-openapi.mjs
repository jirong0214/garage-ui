import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const spec = JSON.parse(
  readFileSync(resolve(repo, 'backend/docs/swagger.json'), 'utf8'),
);

const failures = [];
const requiredPaths = [
  '/health',
  '/auth/config',
  '/auth/login',
  '/api/v1/capabilities',
  '/api/v1/buckets',
  '/api/v1/buckets/{bucket}/objects',
  '/api/v1/buckets/{bucket}/object',
  '/api/v1/buckets/{bucket}/object/metadata',
  '/api/v1/buckets/{bucket}/object/thumbnail',
  '/api/v1/buckets/{bucket}/object/presign',
  '/api/v1/buckets/{bucket}/object/preview-url',
  '/api/v1/object-jobs',
  '/api/v1/object-jobs/{id}',
  '/api/v1/object-jobs/{id}/failures',
  '/api/v1/object-jobs/{id}/cancel',
];

for (const path of requiredPaths) {
  if (!spec.paths?.[path]) failures.push(`missing required path ${path}`);
}

const publicOperations = new Set([
  'GET /health',
  'GET /api/v1/health',
  'GET /auth/config',
  'POST /auth/login',
]);
const securitySchemes = new Set(Object.keys(spec.securityDefinitions ?? {}));
const operationIds = new Set();

for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    const label = `${method.toUpperCase()} ${path}`;
    if (!publicOperations.has(label) && path.startsWith('/api/v1/')) {
      if (!operation.security?.length) {
        failures.push(`${label} is missing security`);
      }
    }
    for (const requirement of operation.security ?? []) {
      for (const name of Object.keys(requirement)) {
        if (!securitySchemes.has(name)) {
          failures.push(`${label} references undefined security scheme ${name}`);
        }
      }
    }
    if (operation.operationId) {
      if (operationIds.has(operation.operationId)) {
        failures.push(`duplicate operationId ${operation.operationId}`);
      }
      operationIds.add(operation.operationId);
    }
  }
}

const canonicalObject = spec.paths?.['/api/v1/buckets/{bucket}/object'];
for (const method of ['get', 'head', 'delete']) {
  const key = canonicalObject?.[method]?.parameters?.find(
    (parameter) => parameter.name === 'key',
  );
  if (!key || key.in !== 'query' || key.required !== true) {
    failures.push(`${method.toUpperCase()} canonical object key must be a required query parameter`);
  }
}

if (spec.paths?.['/api/v1/buckets/{bucket}/objects/{key}/presigned-url']) {
  failures.push('obsolete presigned-url path must not be generated');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Validated ${Object.keys(spec.paths ?? {}).length} OpenAPI paths.`);
