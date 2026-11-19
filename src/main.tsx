import { AppearanceSync } from './lib/appearance';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdvertisementScreen from './screens/Advertisement';
import OverlayScreen from './screens/Overlay';
import { initSpatialNav } from './nav/spatial';
import './index.css';

const isAdvertisement = window.location.hash.startsWith('#/advertisement');
const isOverlay = window.location.hash.startsWith('#/overlay');

if (!isOverlay && !isAdvertisement) initSpatialNav();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><AppearanceSync />{isAdvertisement ? <AdvertisementScreen /> : isOverlay ? <OverlayScreen /> : <App />}</React.StrictMode>
);
