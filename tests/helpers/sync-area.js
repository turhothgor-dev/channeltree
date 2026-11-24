// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Simula browser.storage.sync: cuotas (total, por elemento y número de
 * elementos), copias al leer y escribir, y avisos asíncronos de cambio.
 */
function createSyncArea({
  quotaBytes = 102400,
  quotaBytesPerItem = 8192,
  maxItems = 512,
  onChange,
} = {}) {
  const data = {};
  const calls = { get: 0, set: 0, remove: 0 };
  let nextSetError = null;
  const encoder = new TextEncoder();

  const sizeOf = (key, value) =>
    encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;

  const notify = (changes) => {
    if (typeof onChange === "function" && Object.keys(changes).length > 0) {
      setTimeout(() => onChange(changes, "sync"), 0);
    }
  };

  const area = {
    async get(keys) {
      calls.get += 1;
      if (keys === null || keys === undefined) {
        return structuredClone(data);
      }
      const list = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const key of list) {
        if (key in data) {
          result[key] = structuredClone(data[key]);
        }
      }
      return result;
    },
    async set(items) {
      calls.set += 1;
      if (nextSetError) {
        const error = nextSetError;
        nextSetError = null;
        throw error;
      }
      const next = { ...data, ...structuredClone(items) };
      let total = 0;
      for (const [key, value] of Object.entries(next)) {
        const size = sizeOf(key, value);
        if (size > quotaBytesPerItem && key in items) {
          throw new Error(
            "QuotaExceededError: storage.sync API call exceeded its quota limitations.",
          );
        }
        total += size;
      }
      if (total > quotaBytes || Object.keys(next).length > maxItems) {
        throw new Error(
          "QuotaExceededError: storage.sync API call exceeded its quota limitations.",
        );
      }
      const changes = {};
      for (const [key, value] of Object.entries(structuredClone(items))) {
        changes[key] = {
          ...(key in data ? { oldValue: structuredClone(data[key]) } : {}),
          newValue: structuredClone(value),
        };
        data[key] = value;
      }
      notify(changes);
    },
    async remove(keys) {
      calls.remove += 1;
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const key of list) {
        if (key in data) {
          changes[key] = { oldValue: structuredClone(data[key]) };
          delete data[key];
        }
      }
      notify(changes);
    },
  };

  return {
    area,
    data,
    calls,
    inject(items) {
      const changes = {};
      for (const [key, value] of Object.entries(structuredClone(items))) {
        changes[key] = {
          ...(key in data ? { oldValue: structuredClone(data[key]) } : {}),
          newValue: structuredClone(value),
        };
        data[key] = value;
      }
      notify(changes);
    },
    failNextSet(error) {
      nextSetError = typeof error === "string" ? new Error(error) : error;
    },
  };
}

module.exports = { createSyncArea };
