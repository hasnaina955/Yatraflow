import fs from 'fs';

const desktopReport = fs.readFileSync('C:/Users/hasna/lighthouse-desktop.html', 'utf8');
const mobileReport = fs.readFileSync('C:/Users/hasna/lighthouse-mobile.html', 'utf8');

function parseLighthouseReport(html, platform) {
  const jsonStart = html.indexOf('{', html.indexOf('__LIGHTHOUSE_JSON__ ='));
  let jsonEnd = -1;
  for (let i = jsonStart; i < Math.min(jsonStart + 900000, html.length); i++) {
    if (html[i] === '}' && html[i+1] === ';' && html[i+2] === '<' && html[i+3] === '/') {
      jsonEnd = i;
      break;
    }
  }
  
  if (jsonEnd === -1) {
    console.log(`Could not find JSON end in ${platform}`);
    return;
  }
  
  const jsonStr = html.slice(jsonStart, jsonEnd + 1);
  console.log(`${platform} JSON length: ${jsonStr.length}`);
  
  try {
    const data = JSON.parse(jsonStr);
    
    console.log(`\n=== ${platform} Lighthouse Report ===`);
    console.log('URL:', data.finalUrl);
    console.log('Timestamp:', data.fetchTime);
    console.log('');
    console.log('=== Category Scores ===');
    Object.entries(data.categories).forEach(([k, v]) => {
      const score = Math.round((v.score || 0) * 100);
      let emoji = '❌';
      if (score >= 90) emoji = '🟢';
      else if (score >= 50) emoji = '🟡';
      console.log(`${emoji} ${k}: ${score}/100`);
    });
    console.log('');
    console.log('=== Key Performance Metrics ===');
    const metrics = {
      'first-contentful-paint': { acronym: 'FCP', unit: 'ms' },
      'largest-contentful-paint': { acronym: 'LCP', unit: 'ms' },
      'cumulative-layout-shift': { acronym: 'CLS', unit: '' },
      'interaction-to-next-paint': { acronym: 'INP', unit: 'ms' },
      'total-blocking-time': { acronym: 'TBT', unit: 'ms' },
      'speed-index': { acronym: 'SI', unit: 'ms' }
    };
    Object.entries(metrics).forEach(([k, m]) => {
      if (data.audits[k]) {
        const audit = data.audits[k];
        const value = audit.numericValue || 'N/A';
        const score = Math.round((audit.score || 0) * 100);
        console.log(`  ${m.acronym}: ${value} ${m.unit} (score: ${score})`);
      }
    });
    console.log('');
    console.log('=== Top Performance Opportunities ===');
    const perfAudits = Object.entries(data.audits).filter(([k, v]) => 
      ['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'interaction-to-next-paint', 'total-blocking-time', 'speed-index', 'render-blocking-resources', 'unused-javascript', 'unused-css', 'offscreen-images', 'total-byte-weight', 'dom-size'].includes(k)
    );
    perfAudits.sort((a, b) => (b[1].weight || 0) - (a[1].weight || 0));
    perfAudits.slice(0, 8).forEach(([k, v]) => {
      if (v.score === null || v.score < 1) {
        console.log(`  - ${k}`);
        console.log(`    Impact: ${(v.weight || 0).toFixed(1)}`);
        console.log(`    Score: ${Math.round((v.score || 0) * 100)}`);
      }
    });
    console.log('');
    console.log('=== Accessibility Issues (First 5) ===');
    const issues = data.audits['accessibility']?.details?.issues || [];
    if (issues && Array.isArray(issues) && issues.length > 0) {
      issues.slice(0, 5).forEach(issue => {
        console.log(`  - ${issue.description || issue.header || 'Unknown issue'}`);
      });
    } else {
      console.log('  No major accessibility issues detected');
    }
  } catch (e) {
    console.log(`Error parsing ${platform}:`, e.message);
  }
}

console.log('============================================');
console.log('   YATRAFLOW COMPREHENSIVE PERFORMANCE AUDIT');
console.log('============================================');
parseLighthouseReport(desktopReport, 'Desktop');
parseLighthouseReport(mobileReport, 'Mobile');
console.log('\n============================================');
console.log('   END OF REPORT');
console.log('============================================');

