import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './AppContext';
import { AiExecutionProvider } from './AiExecutionContext';
import { AppContent } from './App';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <AiExecutionProvider>
        <AppContent />
      </AiExecutionProvider>
    </AppProvider>
  </React.StrictMode>
);
