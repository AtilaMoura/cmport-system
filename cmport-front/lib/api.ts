// lib/api.ts
import axios from 'axios';
import { getToken, removeToken } from '@/lib/auth';

export const api = axios.create({
  baseURL: '/api/v1',
});

// Adiciona o token Bearer em todas as requisições
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
