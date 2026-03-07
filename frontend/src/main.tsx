import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { WalletContextProvider } from './contexts/WalletContext'
import { StablecoinProvider } from './contexts/StablecoinContext'
import { ToastProvider } from './contexts/ToastContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <WalletContextProvider>
          <StablecoinProvider>
            <App />
          </StablecoinProvider>
        </WalletContextProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
