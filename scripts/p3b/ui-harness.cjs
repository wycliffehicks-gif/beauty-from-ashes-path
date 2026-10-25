// Test-only bundle: never imported by app routes and never supplies production identity.
const esbuild = require('esbuild');
const path = require('node:path');
const root = process.cwd();
const out = process.argv[2];
const fs = require('node:fs');
if (!out) throw new Error('Temporary output path required');
esbuild.build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
import { StagingConsole } from '${root}/src/components/conversation-staging/StagingConsole';
createRoot(document.getElementById('root')).render(<StagingConsole/>);`,
    loader: 'jsx', resolveDir: root,
  },
  bundle: true, format: 'iife', outfile: out, jsx: 'automatic',
  alias: {
    '@': path.join(root, 'src'),
    '@tanstack/react-start': path.join(root, 'scripts/p3b/ui-mocks.ts'),
    '@/integrations/supabase/client': path.join(root, 'scripts/p3b/ui-mocks.ts'),
    '@/lib/prefs': path.join(root, 'scripts/p3b/ui-mocks.ts'),
    '@/lib/ai/conversation/staging/staging.functions': path.join(root, 'scripts/p3b/ui-mocks.ts'),
  },
  plugins: process.env.P3B_UI_SOURCE ? [{ name: 'local-baseline-only', setup(build) {
    build.onLoad({ filter: /StagingConsole\.tsx$/ }, () => ({ contents: fs.readFileSync(process.env.P3B_UI_SOURCE, 'utf8'), loader: 'tsx', resolveDir: path.join(root, 'src/components/conversation-staging') }));
  } }] : [],
}).catch(() => { process.exitCode = 1; });