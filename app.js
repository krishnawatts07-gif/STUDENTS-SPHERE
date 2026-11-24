import { auth, storage, signInWithGoogle, signOutUser } from './firebaseConfig.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addAchievement, updateAchievement, deleteAchievement, subscribeToUserAchievements, addSkill, deleteSkill, subscribeToUserSkills, saveUserProfile, subscribeToUserProfile } from './firestoreUtils.js';
import { interactWithResumeAssistant, interactWithResumeAssistantStream } from './resumeAssistantService.js';
import { BackendAPI } from './apiService.js';
import { sendAzureChatMessage } from './azureAiService.js';
import { extractPdfText } from './pdfTextService.js';
import { jsPDF } from 'jspdf';

const categories = ['academic', 'certifications', 'competitions', 'workshops', 'projects', 'volunteering'];
let user = null;
let achievements = [];
let userSkills = [];
let unsubscribeAchievements = null;
let unsubscribeSkills = null;
let chatHistory = [];
let generatedResumeText = '';
let userProfile = null;
let unsubscribeProfile = null;
let editing = null;

// Filtering and sorting state
let activeCategoryFilter = 'all';
let currentSearchQuery = '';
let currentSortOption = 'date-desc';

const $ = (id) => document.getElementById(id);

function message(text, target = 'authError') {
  const el = $(target);
  if (el) el.textContent = text;
}

function setView(view) {
  $('authView').hidden = view !== 'auth';
  $('dashboard').hidden = view !== 'dashboard';
}

function showDashboard(currentUser) {
  user = currentUser;
  setView('dashboard');
  $('userName').textContent = user.displayName || user.email?.split('@')[0] || 'Student';
  $('userEmail').textContent = user.email || '';
  if (user.photoURL) {
    $('avatar').innerHTML = `<img src="${user.photoURL}" alt="${user.displayName || 'Avatar'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  } else {
    $('avatar').textContent = ($('userName').textContent[0] || 'S').toUpperCase();
  }
  $('profileEmail').value = user.email || '';
  $('profileDisplay').value = user.displayName || '';

  if (unsubscribeProfile) unsubscribeProfile();
  unsubscribeProfile = subscribeToUserProfile(
    user.uid,
    (profileData) => {
      userProfile = profileData || {};
      renderProfileUI();
    },
    (err) => console.error("Error subscribing to profile:", err)
  );

  if (unsubscribeAchievements) unsubscribeAchievements();
  unsubscribeAchievements = subscribeToUserAchievements(
    user.uid,
    categories,
    (records) => {
      achievements = records;
      updateAchievementsUI();
    },
    () => message('Live data is temporarily unavailable.', 'dataError')
  );

  if (unsubscribeSkills) unsubscribeSkills();
  unsubscribeSkills = subscribeToUserSkills(user.uid, renderSkills, () => message('Skills list unavailable.', 'skillMessage'));
}

function renderProfileUI() {
  if (!userProfile) return;

  // Set inputs if they exist and aren't focused
  const activeEl = document.activeElement;
  const setVal = (id, val) => {
    const el = $(id);
    if (el && activeEl !== el) el.value = val || '';
  };

  setVal('profileDisplay', userProfile.displayName || user.displayName || '');
  setVal('profileHeadline', userProfile.headline || '');
  setVal('profileBio', userProfile.bio || '');
  setVal('profileUniversity', userProfile.university || '');
  setVal('profileDegree', userProfile.degree || '');
  setVal('profileGraduation', userProfile.graduation || '');
  setVal('profilePhone', userProfile.phone || '');
  setVal('profileLocation', userProfile.location || '');
  setVal('profileLinkedIn', userProfile.linkedin || '');
  setVal('profileGitHub', userProfile.github || '');
  setVal('profileWebsite', userProfile.website || '');
  setVal('profileOtherLink', userProfile.otherLink || '');

  // Update Live Card
  const displayName = userProfile.displayName || user.displayName || user.email.split('@')[0];
  $('cardDisplayName').textContent = displayName;
  $('cardHeadline').textContent = userProfile.headline || 'Aspiring Professional';
  $('cardBio').textContent = userProfile.bio || 'Add a short bio to introduce yourself to advisors and recruiters.';

  // Topbar display name sync
  $('userName').textContent = displayName;

  // Avatar handling
  const avatarText = (displayName[0] || 'S').toUpperCase();
  const avatarPreview = $('profileAvatarPreview');
  const mainAvatar = $('avatar');

  if (userProfile.avatarUrl) {
    avatarPreview.innerHTML = `<img src="${userProfile.avatarUrl}" class="profile-avatar-img" style="border:0;width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
    mainAvatar.innerHTML = `<img src="${userProfile.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
    mainAvatar.style.background = 'none';
  } else {
    avatarPreview.textContent = avatarText;
    avatarPreview.style.background = 'var(--coral)';
    mainAvatar.textContent = avatarText;
    mainAvatar.style.background = 'var(--coral)';
  }

  // Social Links Stripe
  updateSocialLinkButton('linkLinkedIn', userProfile.linkedin, 'https://linkedin.com/in/');
  updateSocialLinkButton('linkGitHub', userProfile.github, 'https://github.com/');
  updateSocialLinkButton('linkWebsite', userProfile.website, 'https://');
  updateSocialLinkButton('linkOther', userProfile.otherLink, '');

  // Stats
  $('statAchievementsCount').textContent = achievements.length;
  $('statSkillsCount').textContent = userSkills.length;

  calculateProfileCompleteness();
}

function updateSocialLinkButton(btnId, value, prefix) {
  const btn = $(btnId);
  if (!btn) return;
  if (value && value.trim()) {
    let cleanVal = value.trim();
    if (prefix && !cleanVal.startsWith('http://') && !cleanVal.startsWith('https://')) {
      cleanVal = prefix + cleanVal;
    }
    btn.href = cleanVal;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  } else {
    btn.href = '#';
    btn.style.opacity = '0.3';
    btn.style.pointerEvents = 'none';
  }
}

function calculateProfileCompleteness() {
  if (!userProfile) return;
  const fields = [
    userProfile.displayName || user?.displayName,
    userProfile.headline,
    userProfile.bio,
    userProfile.university,
    userProfile.degree,
    userProfile.graduation,
    userProfile.phone,
    userProfile.location,
    userProfile.linkedin,
    userProfile.github,
    userProfile.website,
    userProfile.avatarUrl
  ];

  const filledCount = fields.filter(f => f && f.trim && f.trim() !== '').length;
  const totalFields = fields.length + (userSkills.length > 0 ? 1 : 0) + (achievements.length > 0 ? 1 : 0);
  const completionPercentage = Math.round((filledCount / (fields.length + 2)) * 100);

  $('completenessPercent').textContent = `${Math.min(100, completionPercentage)}%`;
  $('completenessFill').style.width = `${Math.min(100, completionPercentage)}%`;
}

function renderSkills(skillsList) {
  userSkills = skillsList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const container = $('skillsList');
  if (!container) return;
  if (!userSkills.length) {
    container.innerHTML = '<span style="color:var(--muted);font-size:13px;">No skills added yet. Add your core skills above.</span>';
    return;
  }
  container.innerHTML = userSkills.map((skill) => `
    <span class="tag" style="padding:6px 12px;display:inline-flex;align-items:center;gap:6px;font-size:12px;background:#e6f0d9;color:#2f6b4b;border-radius:20px;font-weight:600;">
      ${escapeHtml(skill.name)}
      <button type="button" data-delete-skill="${skill.id}" aria-label="Delete ${escapeHtml(skill.name)}" style="border:0;background:none;color:#b64d39;font-weight:bold;cursor:pointer;padding:0 2px;font-size:14px;line-height:1;">×</button>
    </span>
  `).join('');

  container.querySelectorAll('[data-delete-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await deleteSkill(user.uid, btn.dataset.deleteSkill);
      } catch (err) {
        message(err.message, 'skillMessage');
      }
    });
  });

  if ($('statSkillsCount')) $('statSkillsCount').textContent = userSkills.length;
  calculateProfileCompleteness();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${months[monthIndex]} ${year}`;
    }
  }
  return dateStr;
}

function getFilteredAndSortedAchievements() {
  let list = [...achievements];

  // 1. Filter by category
  if (activeCategoryFilter !== 'all') {
    list = list.filter((item) => (item.category || '').toLowerCase() === activeCategoryFilter.toLowerCase());
  }

  // 2. Filter by search query
  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.trim().toLowerCase();
    list = list.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const details = (item.details || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      const date = (item.date || '').toLowerCase();
      const attachment = (item.attachmentName || '').toLowerCase();
      return title.includes(q) || details.includes(q) || category.includes(q) || date.includes(q) || attachment.includes(q);
    });
  }

  // 3. Sort
  list.sort((a, b) => {
    switch (currentSortOption) {
      case 'date-asc':
        return String(a.date || '').localeCompare(String(b.date || '')) || (a.title || '').localeCompare(b.title || '');
      case 'title-asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'title-desc':
        return (b.title || '').localeCompare(a.title || '');
      case 'category-asc':
        return (a.category || '').localeCompare(b.category || '') || String(b.date || '').localeCompare(String(a.date || ''));
      case 'date-desc':
      default:
        return String(b.date || '').localeCompare(String(a.date || '')) || (a.title || '').localeCompare(b.title || '');
    }
  });

  return list;
}

function updateAchievementsUI() {
  // Update Global Stats
  if ($('totalCount')) $('totalCount').textContent = achievements.length;
  if ($('categoryCount')) $('categoryCount').textContent = new Set(achievements.map((item) => item.category)).size;
  if ($('monthCount')) $('monthCount').textContent = achievements.filter((item) => String(item.date || '').startsWith('2026-08')).length;
  if ($('achievementsCountBadge')) $('achievementsCountBadge').textContent = achievements.length;

  // Category counts in Overview & Pills
  categories.forEach((category) => {
    const count = achievements.filter((item) => item.category === category).length;
    const catOverviewNode = document.querySelector(`[data-count="${category}"]`);
    if (catOverviewNode) catOverviewNode.textContent = count;

    const pillCount = $(`pillCount${category.charAt(0).toUpperCase() + category.slice(1)}`);
    if (pillCount) pillCount.textContent = count;
  });

  if ($('pillCountAll')) $('pillCountAll').textContent = achievements.length;

  // Render Overview Recent Highlights (top 4 newest)
  const overviewContainer = $('overviewAchievementList');
  if (overviewContainer) {
    const recent = [...achievements].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 4);
    if (recent.length === 0) {
      overviewContainer.innerHTML = '<div style="padding:24px 0;color:var(--muted);font-size:14px;text-align:center;">No achievements added yet. Click "+ Add achievement" to start.</div>';
    } else {
      overviewContainer.innerHTML = recent.map((item) => `
        <article class="overview-item">
          <div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span class="tag tag-${escapeHtml(item.category || '')}">${escapeHtml(item.category || '')}</span>
              ${item.date ? `<span style="font-size:12px;color:var(--muted);">📅 ${formatDate(item.date)}</span>` : ''}
            </div>
            <h3>${escapeHtml(item.title || 'Untitled achievement')}</h3>
            <p>${escapeHtml(item.details || 'No description added')}</p>
          </div>
          <div class="actions">
            <button type="button" class="action-icon-btn" data-edit="${item.id}">Edit</button>
          </div>
        </article>
      `).join('');
    }
  }

  // Render Achievements Workspace Grid
  const visibleAchievements = getFilteredAndSortedAchievements();
  const gridContainer = $('achievementsGrid');

  if (gridContainer) {
    if (visibleAchievements.length === 0) {
      const isFiltered = activeCategoryFilter !== 'all' || currentSearchQuery.trim() !== '';
      gridContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${isFiltered ? '🔍' : '🏆'}</span>
          <h3>${isFiltered ? 'No matching achievements found' : 'No achievements added yet'}</h3>
          <p>${isFiltered ? 'Try clearing search terms or switching category filters.' : 'Showcase your milestones, certificates, and academic growth in one organized space.'}</p>
          ${isFiltered 
            ? '<button type="button" class="google" id="emptyResetBtn" style="width:auto;margin:0 auto;display:inline-block;">Reset filters</button>' 
            : '<button type="button" class="primary" id="emptyAddBtn" style="width:auto;margin:0 auto;display:inline-block;">＋ Add your first achievement</button>'}
        </div>
      `;

      $('emptyResetBtn')?.addEventListener('click', resetFilters);
      $('emptyAddBtn')?.addEventListener('click', () => openForm());
    } else {
      gridContainer.innerHTML = visibleAchievements.map((item) => card(item)).join('');
    }
  }

  // Update Summary bar text & Clear button
  const summaryText = $('filterSummaryText');
  const clearBtn = $('clearFiltersBtn');
  const hasActiveFilters = activeCategoryFilter !== 'all' || currentSearchQuery.trim() !== '';

  if (summaryText) {
    if (hasActiveFilters) {
      summaryText.textContent = `Showing ${visibleAchievements.length} of ${achievements.length} achievements`;
    } else {
      summaryText.textContent = `Showing all ${achievements.length} achievements`;
    }
  }
  if (clearBtn) clearBtn.hidden = !hasActiveFilters;

  // Attach handlers for card action buttons
  document.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => openForm(achievements.find((item) => item.id === button.dataset.edit)));
  });

  document.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this achievement?')) {
        await deleteAchievement(user.uid, button.dataset.category, button.dataset.delete);
      }
    });
  });

  document.querySelectorAll('[data-preview]').forEach((button) => {
    button.addEventListener('click', () => previewEvidence(achievements.find((item) => item.id === button.dataset.preview)));
  });

  if ($('statAchievementsCount')) $('statAchievementsCount').textContent = achievements.length;
  calculateProfileCompleteness();
}

function card(item) {
  const cat = (item.category || 'projects').toLowerCase();
  return `
    <article class="achievement-card">
      <div class="card-content">
        <div class="card-header-meta">
          <span class="tag tag-${escapeHtml(cat)}">${escapeHtml(item.category || 'Project')}</span>
          ${item.date ? `<span class="date-badge">📅 ${formatDate(item.date)}</span>` : ''}
        </div>
        <h3 class="card-title">${escapeHtml(item.title || 'Untitled achievement')}</h3>
        ${item.details ? `<div class="card-details">${escapeHtml(item.details)}</div>` : ''}
        ${item.attachmentUrl 
          ? `<button type="button" class="card-evidence-btn" data-preview="${item.id}" aria-label="View verified evidence">📎 View evidence${item.attachmentName ? `: ${escapeHtml(item.attachmentName)}` : ''}</button>` 
          : item.attachmentPending ? `<span class="tag" style="background:#fff3e0;color:#e65100;">⏳ Evidence upload pending</span>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="action-icon-btn" data-edit="${item.id}" aria-label="Edit achievement">✏️ Edit</button>
        <button type="button" class="action-icon-btn delete-btn" data-delete="${item.id}" data-category="${item.category}" aria-label="Delete achievement">🗑️ Delete</button>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function previewEvidence(item) {
  if (!item?.attachmentUrl) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#141f18cc;backdrop-filter:blur(4px);z-index:100;display:grid;place-items:center;padding:24px';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#ffffff;width:min(900px,100%);height:min(85vh,760px);padding:20px;border-radius:12px;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 50px rgba(0,0,0,0.3)';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px;';
  header.innerHTML = `<span>${escapeHtml(item.attachmentName || 'Evidence')}</span><button type="button" aria-label="Close evidence preview" style="border:0;background:none;font-size:24px;cursor:pointer;color:var(--muted);padding:4px;">×</button>`;
  const close = () => overlay.remove();
  header.querySelector('button').addEventListener('click', close);
  const content = item.attachmentType === 'application/pdf' || item.attachmentName?.toLowerCase().endsWith('.pdf') ? document.createElement('iframe') : document.createElement('img');
  content.src = item.attachmentUrl;
  content.style.cssText = 'width:100%;height:100%;min-height:0;object-fit:contain;border:1px solid #dfe5da;border-radius:8px;background:#f9faf7';
  content.title = item.attachmentName || 'Evidence preview';
  panel.append(header, content);
  overlay.append(panel);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.body.append(overlay);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetFilters() {
  activeCategoryFilter = 'all';
  currentSearchQuery = '';
  const searchInput = $('achievementSearch');
  if (searchInput) searchInput.value = '';
  $('searchWrap')?.classList.remove('has-value');

  document.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });

  updateAchievementsUI();
}

function profileContext() {
  const records = achievements.map((item) => ({
    title: item.title || '',
    category: item.category || '',
    date: item.date || '',
    details: item.details || '',
    evidence: item.attachmentName || '',
    certificateText: item.attachmentText || ''
  }));
  const skillNames = userSkills.map((s) => s.name);
  
  const university = userProfile?.university || '';
  const degree = userProfile?.degree || '';
  const graduation = userProfile?.graduation || '';
  const headline = userProfile?.headline || '';
  const bio = userProfile?.bio || '';
  const linkedin = userProfile?.linkedin ? `linkedin.com/in/${userProfile.linkedin}` : '';
  const github = userProfile?.github ? `github.com/${userProfile.github}` : '';
  const website = userProfile?.website || '';
  const otherLink = userProfile?.otherLink || '';
  
  return `Student name: ${userProfile?.displayName || user?.displayName || 'Student'}
Student email: ${user?.email || ''}
Professional Headline: ${headline}
Summary Bio: ${bio}
Education: ${degree} at ${university} (Graduation: ${graduation})
Contact/Profiles: LinkedIn: ${linkedin}, GitHub: ${github}, Portfolio: ${website}, Other link: ${otherLink}
Student Skills: ${skillNames.length ? skillNames.join(', ') : 'None listed yet'}
Achievements and profile records:
${JSON.stringify(records, null, 2)}`;
}

async function generateResume() {
  const output = $('resumeOutput');
  output.hidden = false;
  if ($('resumeActions')) $('resumeActions').hidden = true;
  output.textContent = 'Building your resume from your profile and skills...';
  const prompt = `${profileContext()}\n\nCreate a complete ATS-friendly student resume in plain text with sections: Summary, Education, Skills, Projects, Certifications, Competitions, Workshops, Volunteering, and Achievements. Include all skills listed in the profile context under the Skills section. Return clean text ready to copy.`;
  try {
    const result = await interactWithResumeAssistant([], prompt);
    generatedResumeText = result.isJson ? 'Parsed profile successfully.' : result.data;
    output.textContent = generatedResumeText;
    if ($('resumeActions')) $('resumeActions').hidden = false;
  } catch (err) {
    console.error("Resume generation failed:", err);
    output.textContent = 'Resume generation is temporarily unavailable. Open the assistant and ask: Generate my resume.';
  }
}

function downloadResumePdf() {
  if (!generatedResumeText) return;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const lines = pdf.splitTextToSize(generatedResumeText, 170);
  let y = 20;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  lines.forEach((line) => {
    if (y > 280) { pdf.addPage(); y = 20; }
    pdf.text(line, 20, y);
    y += 5.5;
  });
  pdf.save(`${(user?.displayName || 'student').toLowerCase().replace(/\s+/g, '_')}_resume.pdf`);
}

function openForm(item = null) {
  editing = item;
  $('modalTitle').textContent = item ? 'Edit achievement' : 'Add achievement';
  $('achievementTitle').value = item?.title || '';
  $('achievementCategory').value = item?.category || 'projects';
  $('achievementDate').value = item?.date || '';
  $('achievementDetails').value = item?.details || '';
  
  if (!$('achievementFile')) {
    $('achievementDetails').insertAdjacentHTML('beforebegin', '<label for="achievementFile">Certificate or screenshot <small>(PDF/JPG/PNG, max 10 MB with Storage, 500 KB without it)</small></label><input id="achievementFile" type="file" accept="application/pdf,image/png,image/jpeg">');
  }
  $('achievementFile').value = '';
  $('modal').hidden = false;
  $('achievementTitle').focus();
}

// Event Listeners for Authentication
let pendingSignup = null;
let resendInterval = null;

function resetOtpView() {
  if (resendInterval) clearInterval(resendInterval);
  if ($('credentialsSection')) $('credentialsSection').hidden = false;
  if ($('authTabs')) $('authTabs').hidden = false;
  if ($('otpSection')) $('otpSection').hidden = true;
  if ($('otpCode')) $('otpCode').value = '';
  pendingSignup = null;
}

function startResendTimer() {
  let seconds = 30;
  if ($('resendTimer')) $('resendTimer').textContent = seconds;
  if ($('resendOtpBtn')) {
    $('resendOtpBtn').disabled = true;
    $('resendOtpBtn').textContent = `Resend code (${seconds}s)`;
  }
  if (resendInterval) clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    seconds -= 1;
    if ($('resendTimer')) $('resendTimer').textContent = seconds;
    if ($('resendOtpBtn')) $('resendOtpBtn').textContent = `Resend code (${seconds}s)`;
    if (seconds <= 0) {
      clearInterval(resendInterval);
      if ($('resendOtpBtn')) {
        $('resendOtpBtn').disabled = false;
        $('resendOtpBtn').textContent = 'Resend code';
      }
    }
  }, 1000);
}

function handleAuthError(error) {
  console.error("Firebase Auth Error:", error);
  const errors = {
    'auth/invalid-credential': 'No account found with this email/password. If you are new, click "Create account" tab first!',
    'auth/user-not-found': 'No user found. Please click the "Create account" tab to sign up!',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists. Click "Log in" tab to sign in.',
    'auth/operation-not-allowed': 'Email/Password sign-in is disabled in your Firebase console.',
    'auth/weak-password': 'Password must contain at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.'
  };
  message(errors[error.code] || `Authentication failed: ${error.message}`);
}

$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  message('');
  try {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    const isSignUp = $('authMode').value === 'signup';
    const name = $('authName').value.trim();
    
    if (isSignUp) {
      if (!name) {
        message('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        message('Password must contain at least 6 characters.');
        return;
      }

      const submitBtn = $('authSubmitBtn');
      const origText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending verification code...';

      try {
        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to send verification code.');
        }

        // Store pending credentials and show OTP screen
        pendingSignup = { email, password, name };
        $('otpEmailTarget').textContent = email;
        $('credentialsSection').hidden = true;
        $('authTabs').hidden = true;
        $('otpSection').hidden = false;
        $('otpCode').value = data.devOtp || '';
        $('otpCode').focus();
        startResendTimer();
        if (data.devMode) {
          message(data.message);
        }
      } catch (otpErr) {
        console.error("OTP send error:", otpErr);
        message(otpErr.message || 'Could not send verification code.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    } else {
      // Normal Login
      const result = await signInWithEmailAndPassword(auth, email, password);
      showDashboard(result.user);
    }
  } catch (error) {
    handleAuthError(error);
  }
});

// OTP Verification Form Submit
$('otpForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  message('');
  if (!pendingSignup) {
    message('No pending registration found. Please try again.');
    resetOtpView();
    return;
  }

  const otp = $('otpCode').value.trim();
  if (otp.length !== 6) {
    message('Please enter the 6-digit verification code.');
    return;
  }

  const verifyBtn = $('verifyOtpBtn');
  const origText = verifyBtn.textContent;
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const response = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingSignup.email, otp })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Incorrect verification code.');
    }

    // OTP verified! Create Firebase account
    const result = await createUserWithEmailAndPassword(auth, pendingSignup.email, pendingSignup.password);
    if (pendingSignup.name) {
      await updateProfile(result.user, { displayName: pendingSignup.name });
    }
    resetOtpView();
    showDashboard(result.user);
  } catch (err) {
    console.error("OTP verify error:", err);
    message(err.message || 'Verification failed.');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = origText;
  }
});

// Resend OTP button
$('resendOtpBtn')?.addEventListener('click', async () => {
  if (!pendingSignup) return;
  message('');
  $('resendOtpBtn').disabled = true;
  try {
    const response = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingSignup.email })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Failed to resend code.');
    if (data.devOtp) $('otpCode').value = data.devOtp;
    startResendTimer();
    message(data.message || 'A new verification code has been sent!');
  } catch (err) {
    message(err.message);
    $('resendOtpBtn').disabled = false;
  }
});

// Change email button
$('backToSignupBtn')?.addEventListener('click', () => {
  resetOtpView();
  setAuthMode('signup');
  $('authEmail').focus();
});

$('googleBtn').addEventListener('click', async () => {
  try {
    message('');
    const result = await signInWithGoogle();
    showDashboard(result.user);
  } catch (error) {
    console.error("Google Auth Error:", error);
    const errors = {
      'auth/popup-closed-by-user': 'Google sign-in window was closed before finishing.',
      'auth/popup-blocked': 'Sign-in popup was blocked by browser. Please allow popups for this site.',
      'auth/unauthorized-domain': 'This domain (e.g. localhost) is not authorized in Firebase Console > Authentication > Settings > Authorized domains.',
      'auth/operation-not-allowed': 'Google Sign-In is not enabled yet in your Firebase Console. Go to Authentication > Sign-in method and enable Google.',
      'auth/account-exists-with-different-credential': 'An account already exists with the same email using a different sign-in method.'
    };
    message(errors[error.code] || `Google sign-in failed: ${error.message}`);
  }
});

function setAuthMode(mode) {
  resetOtpView();
  const isSignup = mode === 'signup';
  if ($('authMode')) $('authMode').value = mode;

  document.querySelectorAll('[data-auth-mode]').forEach((item) => {
    item.classList.toggle('active', item.dataset.authMode === mode);
  });

  const nameWrap = $('nameFieldWrap');
  if (nameWrap) nameWrap.style.display = isSignup ? 'block' : 'none';

  if ($('authTitle')) $('authTitle').textContent = isSignup ? 'Start your story.' : 'Welcome back.';
  if ($('authSubtitle')) $('authSubtitle').textContent = isSignup ? 'Create your Student Sphere account.' : 'Pick up right where your journey left off.';
  if ($('authSubmitBtn')) $('authSubmitBtn').textContent = isSignup ? 'Send verification code' : 'Continue with email';
  message('');
}
window.switchAuthMode = setAuthMode;

document.querySelectorAll('[data-auth-mode]').forEach((button) => {
  button.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode(button.dataset.authMode);
  });
});

$('logoutBtn').addEventListener('click', signOutUser);

// Modal Triggers
$('openModal').addEventListener('click', () => openForm());
$('achievementsAddBtn')?.addEventListener('click', () => openForm());
$('closeModal').addEventListener('click', () => $('modal').hidden = true);
$('cancelModal').addEventListener('click', () => $('modal').hidden = true);

// Add / Edit Achievement Form Submit
$('achievementForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = {
    title: $('achievementTitle').value.trim(),
    date: $('achievementDate').value,
    details: $('achievementDetails').value.trim()
  };
  try {
    const file = $('achievementFile')?.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024 || !/^application\/pdf$|^image\/(png|jpeg)$/.test(file.type)) {
        throw new Error('Choose a PDF, JPG, or PNG smaller than 10 MB.');
      }
      if (file.type === 'application/pdf') {
        try { data.attachmentText = await extractPdfText(file); } catch { data.attachmentText = ''; }
      }
      if (file.size <= 500000) {
        data.attachmentUrl = await readFileAsDataUrl(file);
        data.attachmentName = file.name;
        data.attachmentType = file.type;
      } else {
        try {
          const fileRef = ref(storage, `users/${user.uid}/achievements/${Date.now()}-${file.name}`);
          data.attachmentUrl = await getDownloadURL(await uploadBytes(fileRef, file).then(() => fileRef));
          data.attachmentName = file.name;
          data.attachmentType = file.type;
        } catch {
          data.attachmentName = file.name;
          data.attachmentPending = true;
        }
      }
    }
    if (editing) {
      await updateAchievement(user.uid, editing.category, editing.id, data);
    } else {
      await addAchievement(user.uid, $('achievementCategory').value, data);
    }
    if (data.attachmentPending) {
      message('Achievement saved, but this file is over 500 KB. Add Storage later or use a file link.', 'achievementError');
    } else {
      $('modal').hidden = true;
      message('Achievement saved.', 'dataError');
    }
  } catch (error) {
    message(error.message, 'achievementError');
  }
});

// Category Filter Pills Listener
document.querySelectorAll('.cat-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeCategoryFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('.cat-pill').forEach((b) => b.classList.toggle('active', b === btn));
    updateAchievementsUI();
  });
});

// Sort Control Listener
$('achievementSort')?.addEventListener('change', (event) => {
  currentSortOption = event.target.value;
  updateAchievementsUI();
});

// Live Search Listener
const searchInput = $('achievementSearch');
const searchWrap = $('searchWrap');
const searchClearBtn = $('searchClear');

if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    currentSearchQuery = event.target.value;
    if (searchWrap) {
      searchWrap.classList.toggle('has-value', currentSearchQuery.length > 0);
    }
    updateAchievementsUI();
  });
}

if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      currentSearchQuery = '';
      if (searchWrap) searchWrap.classList.remove('has-value');
      searchInput.focus();
      updateAchievementsUI();
    }
  });
}

// Clear all filters button
$('clearFiltersBtn')?.addEventListener('click', resetFilters);

// Profile Settings
// Profile Settings Save
$('saveProfile')?.addEventListener('click', async () => {
  message('', 'profileMessage');
  const displayName = $('profileDisplay').value.trim();
  if (!displayName) {
    message('Full Name is required.', 'profileMessage');
    return;
  }

  const profileData = {
    displayName,
    headline: $('profileHeadline').value.trim(),
    bio: $('profileBio').value.trim(),
    university: $('profileUniversity').value.trim(),
    degree: $('profileDegree').value.trim(),
    graduation: $('profileGraduation').value.trim(),
    phone: $('profilePhone').value.trim(),
    location: $('profileLocation').value.trim(),
    linkedin: $('profileLinkedIn').value.trim(),
    github: $('profileGitHub').value.trim(),
    website: $('profileWebsite').value.trim(),
    otherLink: $('profileOtherLink').value.trim()
  };

  try {
    await saveUserProfile(user.uid, profileData);
    await updateProfile(user, { displayName });

    // Update global state & Topbar
    $('userName').textContent = displayName;
    const avatarText = (displayName[0] || 'S').toUpperCase();
    if (!userProfile?.avatarUrl) {
      $('avatar').textContent = avatarText;
    }

    message('Profile saved successfully.', 'profileMessage');
    setTimeout(() => message('', 'profileMessage'), 4000);
  } catch (error) {
    message(error.message, 'profileMessage');
  }
});

// Profile Picture Uploader Change Event
$('profilePicInput')?.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    message('Please choose an image file under 2MB.', 'profileMessage');
    return;
  }
  if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
    message('Only PNG, JPG, JPEG, and WebP images are allowed.', 'profileMessage');
    return;
  }

  try {
    message('Processing image...', 'profileMessage');
    const base64 = await readFileAsDataUrl(file);
    await saveUserProfile(user.uid, { avatarUrl: base64 });
    message('Profile photo updated!', 'profileMessage');
    setTimeout(() => message('', 'profileMessage'), 3000);
  } catch (err) {
    message(err.message, 'profileMessage');
  }
});

// Skills Form Submit
$('addSkillForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  message('', 'skillMessage');
  const input = $('skillInput');
  const skillName = input?.value.trim();
  if (!skillName) return;
  try {
    const exists = userSkills.some(s => s.name.toLowerCase() === skillName.toLowerCase());
    if (exists) {
      message('Skill already added.', 'skillMessage');
      setTimeout(() => message('', 'skillMessage'), 3000);
      return;
    }
    await addSkill(user.uid, skillName);
    input.value = '';
    message('Skill added successfully.', 'skillMessage');
    setTimeout(() => message('', 'skillMessage'), 3000);
  } catch (error) {
    message(error.message, 'skillMessage');
  }
});

// Preset Skill Tag Suggestions Listener
document.querySelectorAll('.preset-skill-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const skillName = btn.dataset.skill;
    if (!skillName) return;
    try {
      message('', 'skillMessage');
      const exists = userSkills.some(s => s.name.toLowerCase() === skillName.toLowerCase());
      if (exists) {
        message('Skill already added.', 'skillMessage');
        setTimeout(() => message('', 'skillMessage'), 3000);
        return;
      }
      await addSkill(user.uid, skillName);
      message(`Added ${skillName}!`, 'skillMessage');
      setTimeout(() => message('', 'skillMessage'), 3000);
    } catch (error) {
      message(error.message, 'skillMessage');
    }
  });
});

// Tab Navigation
document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-section]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.workspace-section').forEach((section) => section.hidden = section.id !== button.dataset.section);
}));

// Floating Chat Assistant
$('chatToggle').addEventListener('click', () => $('chat').hidden = !$('chat').hidden);

$('chatMaximize')?.addEventListener('click', () => {
  const chat = $('chat');
  const isMax = chat.classList.toggle('maximized');
  const btn = $('chatMaximize');
  if (btn) {
    btn.textContent = isMax ? '🗗' : '⤢';
    btn.title = isMax ? 'Restore down' : 'Maximize chat';
  }
});

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:10px 0 4px;color:var(--green);font-weight:700;font-size:14px;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:12px 0 6px;color:var(--green);font-weight:700;font-size:15px;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:14px 0 6px;color:var(--green);font-weight:700;font-size:16px;">$1</h2>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--ink);font-weight:700;">$1</strong>');
  html = html.replace(/`(.*?)`/g, '<code style="background:#e6f0d9;color:#2f6b4b;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left:18px;margin-bottom:4px;list-style-type:disc;">$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div style="margin-left:14px;margin-bottom:4px;"><strong>$1.</strong> $2</div>');
  html = html.replace(/\n\n/g, '<div style="height:8px;"></div>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

$('chatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('chatInput').value.trim();
  if (!text) return;
  
  $('messages').insertAdjacentHTML('beforeend', `<div class="message user">${escapeHtml(text)}</div>`);
  $('chatInput').value = '';

  // Check if input is a simple greeting (e.g. "hi", "hello", "hey") to respond instantly and avoid dumping data
  const isGreeting = /^(hello|hi|hey|greetings|good\s*(morning|afternoon|evening)|yo)\b/i.test(text) && text.split(/\s+/).length <= 3;
  const contextualPrompt = isGreeting 
    ? `User greeting: "${text}". Simply reply with a warm, brief greeting and ask how you can help them with their academics, career, or resume.`
    : `${profileContext()}\n\nCRITICAL DIRECTIVE: Answer ONLY the user's specific query. Be concise, direct, and focused. Do not summarize their entire profile or give unsolicited roadmaps.\n\nStudent Request: ${text}`;

  // Create an empty message element first for streaming response
  const messageId = `msg-${Date.now()}`;
  $('messages').insertAdjacentHTML('beforeend', `<div class="message" id="${messageId}" style="min-height: 38px;"><em style="color:var(--muted)">Advisor is typing...</em></div>`);
  const msgContainer = $('messages');
  if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

  try {
    let reply = '';
    try {
      reply = await interactWithResumeAssistantStream(chatHistory, contextualPrompt, (chunk, accumulated) => {
        const msgEl = $(messageId);
        if (msgEl) {
          msgEl.innerHTML = renderMarkdown(accumulated);
          if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        }
      });
      cleanSpilledElements();
    } catch (geminiErr) {
      console.warn("Gemini streaming failed, falling back to Groq:", geminiErr);
      cleanSpilledElements();
      try {
        reply = await BackendAPI.sendGroqChatMessage(chatHistory, contextualPrompt);
        const msgEl = $(messageId);
        if (msgEl) msgEl.innerHTML = renderMarkdown(reply);
      } catch (groqErr) {
        console.warn("Groq failed, falling back to static parser:", groqErr);
        try {
          const result = await BackendAPI.generateResumeData(contextualPrompt);
          reply = result.summary || `Recommended career skills to highlight: ${(result.skills || []).join(', ')}.`;
          const msgEl = $(messageId);
          if (msgEl) msgEl.innerHTML = renderMarkdown(reply);
        } catch (staticErr) {
          console.warn("Static parser failed:", staticErr);
          const msgEl = $(messageId);
          if (msgEl) msgEl.remove();
          cleanSpilledElements();
          throw new Error("All AI models failed");
        }
      }
    }
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  } catch (err) {
    console.error("All AI fallbacks failed:", err);
    cleanSpilledElements();
    $('messages').insertAdjacentHTML('beforeend', '<div class="message">The career advisor is temporarily unavailable. You can still manage your skills and achievements.</div>');
  }
});

function cleanSpilledElements() {
  const container = $('messages');
  if (!container) return;
  Array.from(container.children).forEach((child) => {
    if (!child.classList.contains('message')) {
      child.remove();
    }
  });
}

// Suggestion Chips Click Handler
document.querySelectorAll('.chat-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const query = chip.dataset.query;
    if (query) {
      $('chatInput').value = query;
      $('chatForm').dispatchEvent(new Event('submit'));
    }
  });
});

document.querySelector('#resume .section').insertAdjacentHTML('beforeend', '<button class="add-btn" id="generateResume">Generate resume from my profile</button><div id="resumeActions" hidden style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;"><button class="google" id="downloadResume" style="width:auto;margin:0">📄 Download PDF</button></div><pre id="resumeOutput" hidden style="white-space:pre-wrap;background:#f5f3ec;border:1px solid #dfe4da;padding:16px;border-radius:6px;margin-top:18px;line-height:1.5"></pre>');
$('generateResume').addEventListener('click', generateResume);
$('downloadResume').addEventListener('click', async () => { downloadResumePdf(); });

onAuthStateChanged(auth, (currentUser) => currentUser ? showDashboard(currentUser) : setView('auth'));
