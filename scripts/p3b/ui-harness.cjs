// Test-only bundle: never imported by app routes and never supplies production identity.
const esbuild = require('esbuild');
const path = require('node:path');
const root = process.cwd();
const out = process.argv[2];
if (!out) throw new Error('Temporary output path required');
esbuild.buildSync({
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
});