// lib/api.ts
import axios from 'axios';
import { getToken, removeToken } from '@/lib/auth';

export const api = axios.create({
  baseURL: '/api/v1',
});

// Adiciona o token Bearer e trailing slash para evitar 307 que derruba o Authorization
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Garante trailing slash no path para não provocar redirect 307
  if (config.url) {
    const [path, query] = config.url.split('?');
    if (!path.endsWith('/')) {
      config.url = path + '/' + (query ? '?' + query : '');
    }
  }
  return config;
});

// Se o backend retornar 401, redireciona para login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
