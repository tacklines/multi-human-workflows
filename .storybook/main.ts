import type { StorybookConfig } from '@storybook/web-components-vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|ts)'],
  addons: [],
  framework: {
    name: '@storybook/web-components-vite',
    options: {},
  },
  viteFinal: async (config) => {
    // Ensure Tailwind CSS v4 plugin is present
    config.plugins = config.plugins ?? [];
    const hasTailwind = config.plugins.some(
      (p) => p && typeof p === 'object' && 'name' in p && (p as { name: string }).name === 'vite:tailwindcss'
    );
    if (!hasTailwind) {
      config.plugins.push(tailwindcss());
    }

    // Ensure path alias for @ -> /src
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> | undefined ?? {}),
      '@': path.resolve(__dirname, '../src'),
    };

    return config;
  },
};

export default config;
