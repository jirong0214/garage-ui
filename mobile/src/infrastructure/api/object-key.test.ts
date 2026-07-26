import { describe, expect, it } from 'vitest';

import { objectKeyQuery } from './object-key';

describe('objectKeyQuery', () => {
  it.each([
    ['folder/file.txt', 'key=folder%2Ffile.txt'],
    ['space name.txt', 'key=space+name.txt'],
    ['中文/图片 #1?.jpg', 'key=%E4%B8%AD%E6%96%87%2F%E5%9B%BE%E7%89%87+%231%3F.jpg'],
    ['100%/a+b', 'key=100%25%2Fa%2Bb'],
  ])('encodes an exact S3 key once: %s', (key, expected) => {
    expect(objectKeyQuery(key)).toBe(expected);
    expect(new URLSearchParams(objectKeyQuery(key)).get('key')).toBe(key);
  });
});
