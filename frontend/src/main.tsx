import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import frFR from 'antd/locale/fr_FR';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={frFR} theme={{
      token: {
        colorPrimary: '#1890ff',
        borderRadius: 4,
      },
    }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
  </ConfigProvider>
);
