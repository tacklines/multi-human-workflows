import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';

// Set Shoelace base path for icons and other assets
setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/');

// Import the app shell (which imports all other components)
import './components/app-shell.js';
