import axios from 'axios';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000
});

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    return Promise.reject(error.response?.data || error);
  }
);

export default request;
