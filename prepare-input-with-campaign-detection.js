const body = $json.body;

// Extract and format all campaign data
const companyName = body.company?.name || '';
const companyWebsite = body.company?.website || '';
const companyDomain = companyWebsite.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const campaignName = body.campaign?.campaignName || '';
const product = body.campaign?.product || '';
const targetRegion = body.campaign?.targetRegion || '';
const techFocus = body.campaign?.techFocus || '';
const primaryAngle = body.campaign?.primaryAngle || '';

// Target titles - critical for filtering
const targetTitlesArray = body.campaign?.targetTitles || [];
const targetTitles = Array.isArray(targetTitlesArray)
  ? targetTitlesArray.join(', ')
  : targetTitlesArray.split('\n').map(t => t.trim()).filter(t => t.length > 0).join(', ');

// Target personas
const targetPersonasArray = body.campaign?.targetPersonas || [];
const targetPersonas = Array.isArray(targetPersonasArray)
  ? targetPersonasArray.join('\n')
  : targetPersonasArray;

// Pain points
const painPointsArray = body.campaign?.painPoints || [];
const painPoints = Array.isArray(painPointsArray)
  ? painPointsArray.join('\n')
  : painPointsArray;

// Company research summary
const companyResearch = body.companyResearch || {};
const companySummary = companyResearch.summary || '';
const cloudProvider = companyResearch.cloud_preference?.provider || 'Unknown';
const cloudConfidence = companyResearch.cloud_preference?.confidence || 0;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAMPAIGN TYPE DETECTION & ROLE PRIORITIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const productLower = product.toLowerCase();
const angleLower = primaryAngle.toLowerCase();
const painPointsLower = painPoints.toLowerCase();

let campaignType = 'Cloud Modernization'; // default
let rolePriorities = '';
let searchFocus = '';

// SECURITY & COMPLIANCE CAMPAIGN
if (productLower.includes('security') || productLower.includes('soc') || productLower.includes('siem') ||
    angleLower.includes('security') || angleLower.includes('compliance') ||
    painPointsLower.includes('security') || painPointsLower.includes('compliance') ||
    painPointsLower.includes('iam') || painPointsLower.includes('audit')) {

  campaignType = '🔒 Security & Compliance';
  rolePriorities = `
🎯 **PRIORITY ROLES FOR THIS CAMPAIGN (Security & Compliance)**:

**HIGHEST PRIORITY** (find 3-4 of these):
1. CISO, Chief Information Security Officer, Head of Security, Security Director
2. Cloud Security Architect, Security Architect, Senior Security Engineer
3. Compliance Officer, IT Compliance Manager, Governance Manager (if security-focused)

**MEDIUM PRIORITY** (find 2-3 of these):
4. Head of IT, Director of IT, IT Director (security budget owner)
5. CTO, VP Engineering (strategic oversight, security budget authority)

**LOWER PRIORITY** (find 1-2 if space):
6. Cloud Architect, Infrastructure Manager (if security-focused)`;

  searchFocus = `Focus your searches on:
- "CISO" OR "Chief Information Security Officer"
- "Security Director" OR "Head of Security"
- "Security Architect" OR "Cloud Security Architect"
- "Compliance" OR "Governance" (if IT/security focus)
- Security-related job postings, security blog authors`;
}

// FINOPS / COST OPTIMIZATION CAMPAIGN
else if (productLower.includes('finops') || productLower.includes('cost') ||
         angleLower.includes('cost') || angleLower.includes('spend') || angleLower.includes('finops') ||
         painPointsLower.includes('cost') || painPointsLower.includes('budget') ||
         painPointsLower.includes('finops') || painPointsLower.includes('chargeback')) {

  campaignType = '💰 FinOps & Cost Optimization';
  rolePriorities = `
🎯 **PRIORITY ROLES FOR THIS CAMPAIGN (FinOps & Cost)**:

**HIGHEST PRIORITY** (find 3-4 of these):
1. FinOps Lead, FinOps Manager, Cloud FinOps Lead
2. Cloud Cost Manager, Cloud Financial Manager, Cloud Optimization Manager
3. IT Finance Manager, Technology Finance Manager, IT Budget Manager

**MEDIUM PRIORITY** (find 3-4 of these):
4. CTO, Chief Technology Officer (budget/cost authority)
5. Head of Cloud, Director of Cloud, Cloud Platform Lead (cost accountability)
6. Director of IT, Head of IT (IT budget owner)

**LOWER PRIORITY** (find 1-2 if space):
7. Cloud Architect, Infrastructure Manager (implements cost optimization)`;

  searchFocus = `Focus your searches on:
- "FinOps" OR "Cloud Financial" OR "Cloud Cost"
- "IT Finance" OR "Technology Finance"
- Budget/cost-related job postings
- CTO, Head of Cloud (budget authority)`;
}

// DEVOPS / PLATFORM ENGINEERING CAMPAIGN
else if (productLower.includes('devops') || productLower.includes('platform') || productLower.includes('ci/cd') ||
         angleLower.includes('devops') || angleLower.includes('automation') || angleLower.includes('platform') ||
         painPointsLower.includes('devops') || painPointsLower.includes('ci/cd') || painPointsLower.includes('automation')) {

  campaignType = '🚀 DevOps & Platform Engineering';
  rolePriorities = `
🎯 **PRIORITY ROLES FOR THIS CAMPAIGN (DevOps & Platform)**:

**HIGHEST PRIORITY** (find 3-4 of these):
1. DevOps Manager, DevOps Lead, Head of DevOps, DevOps Director
2. SRE Manager, SRE Lead, Site Reliability Lead, Head of SRE
3. Cloud Platform Lead, Platform Lead, Platform Engineering Manager, Principal Platform Engineer

**MEDIUM PRIORITY** (find 2-3 of these):
4. VP Engineering, Director of Engineering, Engineering Manager (DevOps sponsor)
5. Cloud Architect, Infrastructure Manager (platform/automation focus)

**LOWER PRIORITY** (find 1-2 if space):
6. CTO (strategic oversight only)`;

  searchFocus = `Focus your searches on:
- "DevOps" OR "Site Reliability" OR "SRE"
- "Platform Engineer" OR "Platform Lead"
- CI/CD, automation-related job postings
- VP Engineering, Director of Engineering`;
}

// DEFAULT: CLOUD MODERNIZATION / INFRASTRUCTURE CAMPAIGN
else {
  campaignType = '☁️ Cloud Modernization';
  rolePriorities = `
🎯 **PRIORITY ROLES FOR THIS CAMPAIGN (Cloud Modernization)**:

**HIGHEST PRIORITY** (find 2-3 of these):
1. CTO, Chief Technology Officer (strategic decision maker)
2. Head of IT, Director of IT, IT Director (owns IT strategy)
3. Head of Cloud, Cloud Platform Lead, Director of Cloud (cloud owner)
4. VP Engineering, Head of Infrastructure (technical authority)

**MEDIUM PRIORITY** (find 3-5 of these):
5. Cloud Architect, Lead Cloud Architect, Senior Cloud Architect
6. Infrastructure Manager, Infrastructure Lead, Senior Infrastructure Engineer
7. Enterprise Architect, Solutions Architect, Technical Architect

**LOWER PRIORITY** (find 1-2 if space):
8. DevOps Manager, SRE Manager (operational owner)`;

  searchFocus = `Focus your searches on:
- "CTO" OR "Chief Technology Officer"
- "Head of IT" OR "IT Director" OR "Director of IT"
- "Head of Cloud" OR "Cloud Lead"
- "Cloud Architect" OR "Infrastructure Manager"`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUILD CHAT INPUT WITH CAMPAIGN-SPECIFIC GUIDANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const chatInput = `Find 8-10 IT/Cloud decision-makers at ${companyName}

📋 COMPANY INFO:
- Name: ${companyName}
- Website: ${companyWebsite}
- Domain: ${companyDomain}
- Region: ${targetRegion}
- Industry: ${companySummary}
- Detected Cloud: ${cloudProvider} (${cloudConfidence}% confidence)

💼 CAMPAIGN CONTEXT:
- Campaign: ${campaignName}
- Campaign Type: ${campaignType}
- Product: ${product}
- Value Prop: ${primaryAngle}
- Tech Focus: ${techFocus}

${rolePriorities}

🎯 TARGET TITLES (match these OR RELATED titles):
${targetTitles}

👥 TARGET PERSONAS:
${targetPersonas}

🔥 PAIN POINTS WE SOLVE:
${painPoints}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 YOUR MISSION:

**PHASE 1: Find 8-10 people using DIVERSE WEB SOURCES**

${searchFocus}

🌐 **PRIMARY SOURCES** (LinkedIn profiles may be blocked - use these first):

1. **Company website**:
   - site:${companyDomain} "team" OR "leadership" OR "about" OR "management"
   - site:${companyDomain} "IT" OR "technology" OR "infrastructure"
   - Look for IT/Tech leadership bios, team pages, org charts

2. **Job postings** (reveal IT leaders):
   - "${companyName}" "we are hiring" IT OR technology OR cloud
   - "${companyName}" "reports to" (Director OR Manager OR Head)
   - Look for who's hiring/managing teams

3. **Press releases & news**:
   - "${companyName}" "appoints" OR "promotes" (CTO OR "IT Director" OR technology)
   - "${companyName}" "interview" (technology OR IT OR cloud)
   - Look for IT leader announcements, interviews

4. **Company blog & tech content**:
   - "${companyName}" blog (cloud OR infrastructure OR DevOps)
   - Look for author bylines with IT roles

5. **LinkedIn** (if accessible):
   - "${companyName}" site:linkedin.com/company employees
   - "${companyName}" relevant titles site:linkedin.com
   - "${companyName}" "Cloud" OR "DevOps" OR "Infrastructure" site:linkedin.com

6. **Industry sources**:
   - Crunchbase, company databases, conference speakers

**Get FULL NAMES, JOB TITLES, and verify they CURRENTLY work there**

**PHASE 2: Get LinkedIn URLs using search_linkedin tool**
- For each person from Phase 1, call search_linkedin tool
- Query format: "FirstName LastName" "${companyName}" site:linkedin.com/in/
- If no URL found after 2 tries, leave empty and explain in evidence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 FLEXIBLE TITLE MATCHING:

**Accept titles that MATCH or are RELATED TO target titles:**

Examples:
- "IT Director" = "Director of IT" = "Director IT"
- "Cloud Engineer" or "Senior Cloud Engineer" = related to "Cloud Architect"
- "Infrastructure Engineer" = related to "Infrastructure Manager"
- "IT Manager" = related to "Director of IT" (smaller companies)
- "Platform Engineer" = related to "Cloud Platform Lead"
- "Informatisering & Automatisering (I&A)" = Dutch IT department

**DO NOT return**: HR, Sales, Marketing, Operations, Finance (unless cloud-focused), Board members, Former employees

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 CRITICAL RULES:

1. **PRIORITIZE roles listed above** for this campaign type
2. **Accept RELATED titles**, not just exact matches
3. **Use DIVERSE sources** (company site, job posts, news, blogs)
4. **Verify current employment** (2024-2025 mentions)
5. **Target 8-10 contacts** following the priority guidance above
6. **Evidence-based**: Note WHERE you found each person
7. **LinkedIn URLs**: Use search_linkedin tool in Phase 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 IMPORTANT:
- Follow the PRIORITY ROLES guidance above for this ${campaignType} campaign
- Quality over quantity: 6-8 highly relevant contacts > 10 weak ones
- If you find "IT Manager" at mid-size company, acceptable (related to "Director of IT")
- If you find "Senior Cloud Engineer", acceptable (related to "Cloud Architect")

Return JSON with your findings.`;

return [{
  json: {
    chatInput: chatInput,
    webhookData: body,
    campaignType: campaignType
  }
}];
