// resumeTemplateService.js
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Formats a date string (YYYY-MM or YYYY-MM-DD) into readable Month Year
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[monthIndex] || parts[1]} ${year}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Escapes HTML characters to prevent XSS
 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format bullet points or lines of details
 */
function formatDetails(details) {
  if (!details) return '';
  const lines = details.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].startsWith('-') && !lines[0].startsWith('•')) {
    return `<p class="res-desc">${esc(lines[0])}</p>`;
  }
  return `<ul class="res-bullets">
    ${lines.map(line => `<li>${esc(line.replace(/^[-•*]\s*/, ''))}</li>`).join('')}
  </ul>`;
}

/**
 * TEMPLATE 1: Modern Minimalist (ATS Standard)
 * Clean single-column layout, highly readable, crisp horizontal accents
 */
export function renderModernTemplate(data, accent) {
  const { name, headline, email, phone, location, links, bio, education, skills, projects, certifications, otherAchievements } = data;

  const contactItems = [];
  if (email) contactItems.push(`<span class="res-contact-item">✉ ${esc(email)}</span>`);
  if (phone) contactItems.push(`<span class="res-contact-item">☎ ${esc(phone)}</span>`);
  if (location) contactItems.push(`<span class="res-contact-item">📍 ${esc(location)}</span>`);
  if (links.linkedin) contactItems.push(`<span class="res-contact-item">🔗 linkedin.com/in/${esc(links.linkedin)}</span>`);
  if (links.github) contactItems.push(`<span class="res-contact-item">💻 github.com/${esc(links.github)}</span>`);
  if (links.website) contactItems.push(`<span class="res-contact-item">🌐 ${esc(links.website)}</span>`);

  return `
    <div class="resume-doc modern-layout" style="--res-color: ${accent};">
      <header class="res-header">
        <h1 class="res-name" style="color: ${accent};">${esc(name)}</h1>
        ${headline ? `<div class="res-headline">${esc(headline)}</div>` : ''}
        <div class="res-contact-bar">${contactItems.join(' • ')}</div>
      </header>

      ${bio ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Professional Summary</h2>
          <p class="res-summary">${esc(bio)}</p>
        </section>
      ` : ''}

      ${(education.degree || education.university) ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Education</h2>
          <div class="res-item">
            <div class="res-item-header">
              <strong class="res-item-title">${esc(education.degree || 'Degree Program')}</strong>
              <span class="res-item-date">${esc(education.graduation ? `Expected: ${education.graduation}` : '')}</span>
            </div>
            <div class="res-item-sub">${esc(education.university || '')}</div>
          </div>
        </section>
      ` : ''}

      ${skills.length > 0 ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Technical & Professional Skills</h2>
          <div class="res-skills-list">
            ${skills.map(s => `<span class="res-skill-badge" style="border-color: ${accent}44; color: ${accent};">${esc(s)}</span>`).join('')}
          </div>
        </section>
      ` : ''}

      ${projects.length > 0 ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Key Projects</h2>
          ${projects.map(p => `
            <div class="res-item">
              <div class="res-item-header">
                <strong class="res-item-title">${esc(p.title)}</strong>
                <span class="res-item-date">${formatDate(p.date)}</span>
              </div>
              ${formatDetails(p.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${certifications.length > 0 ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Certifications & Training</h2>
          ${certifications.map(c => `
            <div class="res-item">
              <div class="res-item-header">
                <strong class="res-item-title">${esc(c.title)}</strong>
                <span class="res-item-date">${formatDate(c.date)}</span>
              </div>
              ${formatDetails(c.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${otherAchievements.length > 0 ? `
        <section class="res-section">
          <h2 class="res-section-title" style="color: ${accent}; border-bottom-color: ${accent};">Achievements & Competitions</h2>
          ${otherAchievements.map(a => `
            <div class="res-item">
              <div class="res-item-header">
                <strong class="res-item-title">${esc(a.title)}</strong>
                <span class="res-item-date">${formatDate(a.date)}</span>
              </div>
              <div class="res-item-sub" style="color: ${accent}; font-weight:600; font-size:12px; text-transform:uppercase;">${esc(a.category)}</div>
              ${formatDetails(a.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}
    </div>
  `;
}

/**
 * TEMPLATE 2: Executive Two-Column Sidebar
 * Left tinted panel for credentials and skills; right spacious panel for experience
 */
export function renderSidebarTemplate(data, accent) {
  const { name, headline, email, phone, location, links, bio, education, skills, projects, certifications, otherAchievements } = data;

  return `
    <div class="resume-doc sidebar-layout" style="--res-color: ${accent};">
      <!-- Left Column / Sidebar -->
      <aside class="sidebar-col" style="border-right-color: ${accent}22;">
        <div class="sidebar-brand">
          <div class="sidebar-avatar-placeholder" style="background:${accent};">
            ${(name[0] || 'S').toUpperCase()}
          </div>
        </div>

        <div class="sidebar-group">
          <h3 class="sidebar-heading" style="color:${accent};">Contact</h3>
          <ul class="sidebar-contact">
            ${email ? `<li><small>Email</small><span>${esc(email)}</span></li>` : ''}
            ${phone ? `<li><small>Phone</small><span>${esc(phone)}</span></li>` : ''}
            ${location ? `<li><small>Location</small><span>${esc(location)}</span></li>` : ''}
            ${links.linkedin ? `<li><small>LinkedIn</small><span>in/${esc(links.linkedin)}</span></li>` : ''}
            ${links.github ? `<li><small>GitHub</small><span>${esc(links.github)}</span></li>` : ''}
            ${links.website ? `<li><small>Website</small><span>${esc(links.website)}</span></li>` : ''}
          </ul>
        </div>

        ${(education.degree || education.university) ? `
          <div class="sidebar-group">
            <h3 class="sidebar-heading" style="color:${accent};">Education</h3>
            <div class="sidebar-edu">
              <strong>${esc(education.degree || '')}</strong>
              <div class="sidebar-sub">${esc(education.university || '')}</div>
              ${education.graduation ? `<div class="sidebar-date">${esc(education.graduation)}</div>` : ''}
            </div>
          </div>
        ` : ''}

        ${skills.length > 0 ? `
          <div class="sidebar-group">
            <h3 class="sidebar-heading" style="color:${accent};">Skills</h3>
            <div class="sidebar-skills">
              ${skills.map(s => `<span class="sidebar-skill-tag" style="background:${accent}18; color:${accent};">${esc(s)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </aside>

      <!-- Right Main Column -->
      <main class="main-col">
        <header class="main-header">
          <h1 class="res-name">${esc(name)}</h1>
          ${headline ? `<div class="res-headline" style="color:${accent};">${esc(headline)}</div>` : ''}
        </header>

        ${bio ? `
          <section class="res-section">
            <h2 class="res-section-title" style="color:${accent}; border-bottom-color:${accent}33;">Profile</h2>
            <p class="res-summary">${esc(bio)}</p>
          </section>
        ` : ''}

        ${projects.length > 0 ? `
          <section class="res-section">
            <h2 class="res-section-title" style="color:${accent}; border-bottom-color:${accent}33;">Key Projects</h2>
            ${projects.map(p => `
              <div class="res-item">
                <div class="res-item-header">
                  <strong class="res-item-title">${esc(p.title)}</strong>
                  <span class="res-item-date">${formatDate(p.date)}</span>
                </div>
                ${formatDetails(p.details)}
              </div>
            `).join('')}
          </section>
        ` : ''}

        ${certifications.length > 0 ? `
          <section class="res-section">
            <h2 class="res-section-title" style="color:${accent}; border-bottom-color:${accent}33;">Certifications</h2>
            ${certifications.map(c => `
              <div class="res-item">
                <div class="res-item-header">
                  <strong class="res-item-title">${esc(c.title)}</strong>
                  <span class="res-item-date">${formatDate(c.date)}</span>
                </div>
                ${formatDetails(c.details)}
              </div>
            `).join('')}
          </section>
        ` : ''}

        ${otherAchievements.length > 0 ? `
          <section class="res-section">
            <h2 class="res-section-title" style="color:${accent}; border-bottom-color:${accent}33;">Milestones & Achievements</h2>
            ${otherAchievements.map(a => `
              <div class="res-item">
                <div class="res-item-header">
                  <strong class="res-item-title">${esc(a.title)}</strong>
                  <span class="res-item-date">${formatDate(a.date)}</span>
                </div>
                ${formatDetails(a.details)}
              </div>
            `).join('')}
          </section>
        ` : ''}
      </main>
    </div>
  `;
}

/**
 * TEMPLATE 3: Ivy Academic (Classic Serif)
 * Prestigious, formal typography, centered headers, clean horizontal dividers
 */
export function renderIvyTemplate(data, accent) {
  const { name, headline, email, phone, location, links, bio, education, skills, projects, certifications, otherAchievements } = data;

  const contactParts = [];
  if (email) contactParts.push(esc(email));
  if (phone) contactParts.push(esc(phone));
  if (location) contactParts.push(esc(location));
  if (links.linkedin) contactParts.push(`linkedin.com/in/${esc(links.linkedin)}`);
  if (links.github) contactParts.push(`github.com/${esc(links.github)}`);
  if (links.website) contactParts.push(esc(links.website));

  return `
    <div class="resume-doc ivy-layout" style="--res-color: ${accent};">
      <header class="ivy-header">
        <h1 class="ivy-name">${esc(name)}</h1>
        ${headline ? `<div class="ivy-headline">${esc(headline)}</div>` : ''}
        <div class="ivy-contact">${contactParts.join(' &nbsp;•&nbsp; ')}</div>
        <div class="ivy-rule" style="background:${accent};"></div>
      </header>

      ${bio ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Objective & Profile</h2>
          <p class="ivy-summary">${esc(bio)}</p>
        </section>
      ` : ''}

      ${(education.degree || education.university) ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Education</h2>
          <div class="ivy-item">
            <div class="ivy-item-row">
              <span class="ivy-item-main"><strong>${esc(education.university || '')}</strong></span>
              <span class="ivy-item-right">${esc(education.graduation ? `${education.graduation}` : '')}</span>
            </div>
            <div class="ivy-item-sub"><em>${esc(education.degree || '')}</em></div>
          </div>
        </section>
      ` : ''}

      ${skills.length > 0 ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Areas of Expertise & Skills</h2>
          <div class="ivy-skills-text">
            <strong>Core Skills:</strong> ${skills.map(s => esc(s)).join(', ')}
          </div>
        </section>
      ` : ''}

      ${projects.length > 0 ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Selected Projects & Research</h2>
          ${projects.map(p => `
            <div class="ivy-item">
              <div class="ivy-item-row">
                <span class="ivy-item-main"><strong>${esc(p.title)}</strong></span>
                <span class="ivy-item-right">${formatDate(p.date)}</span>
              </div>
              ${formatDetails(p.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${certifications.length > 0 ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Certifications & Honors</h2>
          ${certifications.map(c => `
            <div class="ivy-item">
              <div class="ivy-item-row">
                <span class="ivy-item-main"><strong>${esc(c.title)}</strong></span>
                <span class="ivy-item-right">${formatDate(c.date)}</span>
              </div>
              ${formatDetails(c.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${otherAchievements.length > 0 ? `
        <section class="ivy-section">
          <h2 class="ivy-section-title" style="color:${accent};">Competitions & Extra-Curriculars</h2>
          ${otherAchievements.map(a => `
            <div class="ivy-item">
              <div class="ivy-item-row">
                <span class="ivy-item-main"><strong>${esc(a.title)}</strong> (${esc(a.category)})</span>
                <span class="ivy-item-right">${formatDate(a.date)}</span>
              </div>
              ${formatDetails(a.details)}
            </div>
          `).join('')}
        </section>
      ` : ''}
    </div>
  `;
}

/**
 * TEMPLATE 4: Creative Tech (Modern Badge Accent)
 * Contemporary visual hierarchy, rounded cards, colored tech pills
 */
export function renderCreativeTemplate(data, accent) {
  const { name, headline, email, phone, location, links, bio, education, skills, projects, certifications, otherAchievements } = data;

  return `
    <div class="resume-doc creative-layout" style="--res-color: ${accent};">
      <header class="creative-header" style="background: linear-gradient(135deg, ${accent}12, #ffffff); border-left: 5px solid ${accent};">
        <div class="creative-header-top">
          <h1 class="creative-name" style="color:${accent};">${esc(name)}</h1>
          ${headline ? `<span class="creative-role-badge" style="background:${accent}; color:#fff;">${esc(headline)}</span>` : ''}
        </div>
        <div class="creative-contact-pills">
          ${email ? `<span class="c-pill">✉ ${esc(email)}</span>` : ''}
          ${phone ? `<span class="c-pill">☎ ${esc(phone)}</span>` : ''}
          ${location ? `<span class="c-pill">📍 ${esc(location)}</span>` : ''}
          ${links.linkedin ? `<span class="c-pill">in/${esc(links.linkedin)}</span>` : ''}
          ${links.github ? `<span class="c-pill">git/${esc(links.github)}</span>` : ''}
          ${links.website ? `<span class="c-pill">🌐 ${esc(links.website)}</span>` : ''}
        </div>
      </header>

      ${bio ? `
        <section class="creative-section">
          <h2 class="creative-title" style="color:${accent};"><span class="c-icon">✦</span> About Me</h2>
          <p class="res-summary">${esc(bio)}</p>
        </section>
      ` : ''}

      ${skills.length > 0 ? `
        <section class="creative-section">
          <h2 class="creative-title" style="color:${accent};"><span class="c-icon">⚡</span> Skills & Tech Stack</h2>
          <div class="creative-skills-grid">
            ${skills.map(s => `
              <div class="c-skill-card" style="border-color:${accent}33;">
                <span class="c-dot" style="background:${accent};"></span>
                <span>${esc(s)}</span>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${(education.degree || education.university) ? `
        <section class="creative-section">
          <h2 class="creative-title" style="color:${accent};"><span class="c-icon">🎓</span> Education</h2>
          <div class="creative-card" style="border-left-color:${accent};">
            <div class="res-item-header">
              <strong class="res-item-title">${esc(education.degree || 'Degree')}</strong>
              <span class="res-item-date" style="color:${accent}; font-weight:700;">${esc(education.graduation || '')}</span>
            </div>
            <div class="res-item-sub">${esc(education.university || '')}</div>
          </div>
        </section>
      ` : ''}

      ${projects.length > 0 ? `
        <section class="creative-section">
          <h2 class="creative-title" style="color:${accent};"><span class="c-icon">🚀</span> Featured Projects</h2>
          <div class="creative-projects-grid">
            ${projects.map(p => `
              <div class="creative-card" style="border-left-color:${accent};">
                <div class="res-item-header">
                  <strong class="res-item-title">${esc(p.title)}</strong>
                  <span class="res-item-date">${formatDate(p.date)}</span>
                </div>
                ${formatDetails(p.details)}
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${certifications.length > 0 ? `
        <section class="creative-section">
          <h2 class="creative-title" style="color:${accent};"><span class="c-icon">🏅</span> Certifications & Honors</h2>
          <div class="creative-projects-grid">
            ${certifications.map(c => `
              <div class="creative-card" style="border-left-color:${accent};">
                <div class="res-item-header">
                  <strong class="res-item-title">${esc(c.title)}</strong>
                  <span class="res-item-date">${formatDate(c.date)}</span>
                </div>
                ${formatDetails(c.details)}
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}
    </div>
  `;
}

/**
 * Main Template Router
 */
export function renderResume(templateName, data, accentColor = '#15803d') {
  switch (templateName) {
    case 'sidebar':
      return renderSidebarTemplate(data, accentColor);
    case 'ivy':
      return renderIvyTemplate(data, accentColor);
    case 'creative':
      return renderCreativeTemplate(data, accentColor);
    case 'modern':
    default:
      return renderModernTemplate(data, accentColor);
  }
}

/**
 * Builds standard normalized resume data object from user profile & achievements
 */
export function buildResumeData(userProfile, user, userSkills, achievements) {
  const profile = userProfile || {};
  const skills = (userSkills || []).map(s => s.name || s);
  
  const projects = (achievements || []).filter(a => a.category === 'projects');
  const certifications = (achievements || []).filter(a => a.category === 'certifications');
  const otherAchievements = (achievements || []).filter(a => a.category !== 'projects' && a.category !== 'certifications');

  return {
    name: profile.displayName || user?.displayName || user?.email?.split('@')[0] || 'Student Name',
    headline: profile.headline || 'Student & Aspiring Professional',
    email: user?.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    links: {
      linkedin: profile.linkedin || '',
      github: profile.github || '',
      website: profile.website || ''
    },
    bio: profile.bio || '',
    education: {
      degree: profile.degree || '',
      university: profile.university || '',
      graduation: profile.graduation || ''
    },
    skills: skills.length > 0 ? skills : ['Problem Solving', 'Team Leadership', 'Project Management'],
    projects: projects.length > 0 ? projects : [
      {
        title: 'Academic Portfolio Project',
        date: '2026-05',
        details: 'Developed a responsive web application highlighting achievements and coursework milestones.\nIntegrated live data storage and automated resume generation.\nCollaborated on user interface design with modern accessibility standards.'
      }
    ],
    certifications: certifications.length > 0 ? certifications : [],
    otherAchievements: otherAchievements.length > 0 ? otherAchievements : []
  };
}

/**
 * High-resolution PDF export using html2canvas and jsPDF
 */
export async function exportResumePdf(element, studentName = 'student', templateName = 'modern') {
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2, // 2x resolution for crisp text
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

  const cleanName = studentName.trim().toLowerCase().replace(/\s+/g, '_');
  pdf.save(`${cleanName}_resume_${templateName}.pdf`);
}
