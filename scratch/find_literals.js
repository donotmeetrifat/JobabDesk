import fs from 'fs';

const files = [
  'src/app/(dashboard)/settings/page.tsx',
  'src/components/settings/ai-config.tsx',
  'src/components/settings/ai-knowledge.tsx',
  'src/components/settings/api-keys-settings.tsx',
  'src/components/settings/appearance-panel.tsx',
  'src/components/settings/browser-notifications-card.tsx',
  'src/components/settings/custom-fields-settings.tsx',
  'src/components/settings/deals-settings.tsx',
  'src/components/settings/fields-and-tags-panel.tsx',
  'src/components/settings/invite-member-dialog.tsx',
  'src/components/settings/members-tab.tsx',
  'src/components/settings/password-form.tsx',
  'src/components/settings/profile-form.tsx',
  'src/components/settings/quick-replies-manager.tsx',
  'src/components/settings/role-meta.ts',
  'src/components/settings/security-panel.tsx',
  'src/components/settings/sessions-card.tsx',
  'src/components/settings/settings-chip.tsx',
  'src/components/settings/settings-overview.tsx',
  'src/components/settings/settings-panel-head.tsx',
  'src/components/settings/settings-rail.tsx',
  'src/components/settings/settings-sections.ts',
  'src/components/settings/tag-manager.tsx',
  'src/components/settings/template-manager.tsx',
  'src/components/settings/whatsapp-config.tsx'
];

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf-8');
  const lines = code.split('\n');

  lines.forEach((line, i) => {
    // Check for || 'English string'
    const fallbackMatch = line.match(/\|\|\s*['"]([A-Z][a-zA-Z0-9\s,\.\?\!'"]+)['"]/);
    if (fallbackMatch && !line.includes('t(')) {
      console.log(`${file}:${i+1} Fallback string: "${fallbackMatch[1]}"`);
    }

    // Check for confirm/alert
    const confirmMatch = line.match(/confirm\(\s*['"]([A-Z][a-zA-Z0-9\s,\.\?\!'"]+)['"]/);
    if (confirmMatch && !line.includes('t(')) {
      console.log(`${file}:${i+1} Confirm string: "${confirmMatch[1]}"`);
    }
  });
});
