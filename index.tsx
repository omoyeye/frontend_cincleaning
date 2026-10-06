
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const content = rootElement.innerHTML.replace('<!--app-html-->', '').trim();

if (!content) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
} else {
    ReactDOM.hydrateRoot(
        rootElement,
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
