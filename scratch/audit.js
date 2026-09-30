import fs from 'fs';
import path from 'path';

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

console.log(`Auditing ${files.length} settings files...\n`);

let totalHardcodedCount = 0;

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  const code = fs.readFileSync(file, 'utf-8');
  const lines = code.split('\n');
  const issues = [];

  lines.forEach((line, i) => {
    // Skip comments and imports
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('import ')) return;

    // Toast check with hardcoded strings
    const toastMatch = line.match(/toast\.(?:error|success|info|warning)\(\s*["']([^"']+)["']/);
    if (toastMatch && !toastMatch[1].startsWith('t(')) {
      issues.push({ line: i + 1, type: 'toast', text: toastMatch[1] });
    }

    // confirm / alert check with hardcoded strings
    const confirmMatch = line.match(/(?:window\.)?(?:confirm|alert)\(\s*["']([^"']+)["']/);
    if (confirmMatch) {
      issues.push({ line: i + 1, type: 'confirm/alert', text: confirmMatch[1] });
    }

    // Placeholder check
    const placeholderMatch = line.match(/placeholder=\s*["']([^"']+)["']/);
    if (placeholderMatch && !line.includes('t(')) {
      issues.push({ line: i + 1, type: 'placeholder', text: placeholderMatch[1] });
    }

    // Title attribute or prop with literal string
    const titleMatch = line.match(/title=\s*["']([^"']+)["']/);
    if (titleMatch && !line.includes('t(') && !line.includes('title=') && titleMatch[1].length > 2) {
      issues.push({ line: i + 1, type: 'title prop', text: titleMatch[1] });
    }

    // Description prop with literal string
    const descMatch = line.match(/description=\s*["']([^"']+)["']/);
    if (descMatch && !line.includes('t(')) {
      issues.push({ line: i + 1, type: 'description prop', text: descMatch[1] });
    }

    // JSX text nodes (e.g. >Hardcoded text<)
    const jsxMatch = line.match(/>([^<>{}]+)</);
    if (jsxMatch) {
      const text = jsxMatch[1].trim();
      // Ignore punctuation/symbols/numbers/code
      if (text && text.length > 1 && /[a-zA-Z]{2,}/.test(text) && !['use client'].includes(text)) {
        issues.push({ line: i + 1, type: 'JSX text', text });
      }
    }
  });

  if (issues.length > 0) {
    totalHardcodedCount += issues.length;
    console.log(`❌ ${file} (${issues.length} issues):`);
    issues.forEach(iss => console.log(`   Line ${iss.line} [${iss.type}]: "${iss.text}"`));
  } else {
    console.log(`✅ ${file}: Fully translated`);
  }
});

console.log(`\nTotal potential hardcoded issues found: ${totalHardcodedCount}`);
