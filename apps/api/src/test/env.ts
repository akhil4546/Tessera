import 'reflect-metadata';

process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-32-chars-min';
process.env.TOTP_ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.WEB_ORIGIN ??= 'http://127.0.0.1:3100';
process.env.COOKIE_SECURE ??= 'false';
process.env.LOG_LEVEL ??= 'silent';
process.env.STORAGE_DRIVER ??= 'fs';
process.env.MEDIA_PROCESS ??= 'inline';
process.env.STORAGE_FS_ROOT ??= `${process.cwd()}/.tessera-storage-test`;
