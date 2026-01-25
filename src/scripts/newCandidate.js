#!/usr/bin/env node

const { execSync } = require('child_process');

// Get arguments: npm run new:candidate "Candidate Name" [year]
const args = process.argv.slice(2);
const name = args[0] || 'new-candidate';
const year = args[1] ? parseInt(args[1]) : new Date().getFullYear();

// Create slug from name
const slug = name.toLowerCase().replace(/\s+/g, '-');

// Create path organized by year: candidates/{year}/{candidate-name}/index.md
const path = `content/english/candidates/${year}/${slug}/index.md`;

console.log(`Creating candidate profile: ${name}`);
console.log(`Path: ${path}`);
console.log(`Election year: ${year}`);

try {
  execSync(`hugo new ${path} --kind candidates`, { stdio: 'inherit' });
  console.log(`\nSuccess! Edit your new candidate profile at: src/${path}`);
} catch (error) {
  console.error('Error creating candidate profile:', error.message);
  process.exit(1);
}
