import { auth, storage, signInWithGoogle, signOutUser } from './firebaseConfig.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addAchievement, updateAchievement, deleteAchievement, subscribeToUserAchievements, addSkill, deleteSkill, subscribeToUserSkills } from './firestoreUtils.js';
import { interactWithResumeAssistant } from './resumeAssistantService.js';
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
let editing = null;
let chatHistory = [];
let generatedResumeText = '';
const $ = (id) => document.getElementById(id);

document.title = 'Student Sphere | Student Achievement Organizer';
document.querySelectorAll('.brand').forEach((element) => { element.textContent = 'Student Sphere'; });
document.querySelector('.chat-head strong').textContent = 'Career & Resume Advisor';
document.querySelector('.chat-head small').textContent = 'Personalized career guidance & ATS resume builder.';
[...document.body.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().startsWith('+')).forEach((node) => node.remove());

function message(text, target = 'authError') { const el = $(target); if (el) el.textContent = text; }
function setView(view) { $('authView').hidden = view !== 'auth'; $('dashboard').hidden = view !== 'dashboard'; }

function showDashboard(currentUser) {
  user = currentUser;
  setView('dashboard');
  $('userName').textContent = user.displayName || user.email.split('@')[0];
  $('userEmail').textContent = user.email;
  $('avatar').textContent = ($('userName').textContent[0] || 'S').toUpperCase();
  $('profileEmail').value = user.email;
  $('profileDisplay').value = user.displayName || '';

  if (unsubscribeAchievements) unsubscribeAchievements();
  unsubscribeAchievements = subscribeToUserAchievements(user.uid, categories, renderAchievements, () => message('Live data is temporarily unavailable.', 'dataError'));

  if (unsubscribeSkills) unsubscribeSkills();
  unsubscribeSkills = subscribeToUserSkills(user.uid, renderSkills, () => message('Skills list unavailable.', 'skillMessage'));
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
}

function renderAchievements(records) {
  achievements = records.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  $('totalCount').textContent = achievements.length;
  $('categoryCount').textContent = new Set(achievements.map((item) => item.category)).size;
  $('monthCount').textContent = achievements.filter((item) => String(item.date || '').startsWith('2026-08')).length;
  if ($('profilePercent')) $('profilePercent').textContent = `${Math.min(100, 25 + Math.min(achievements.length, 6) * 12)}%`;
  const selected = $('categoryFilter').value;
  const visible = selected === 'all' ? achievements : achievements.filter((item) => item.category === selected);
  document.querySelectorAll('#achievementList').forEach((list) => { list.innerHTML = visible.length ? visible.map(card).join('') : '<div class="empty">No achievements here yet. Add your first one.</div>'; });
  document.querySelectorAll('#achievementList [data-edit]').forEach((button) => button.addEventListener('click', () => openForm(achievements.find((item) => item.id === button.dataset.edit))));
  document.querySelectorAll('#achievementList [data-delete]').forEach((button) => button.addEventListener('click', async () => { if (confirm('Delete this achievement?')) await deleteAchievement(user.uid, button.dataset.category, button.dataset.delete); }));
  document.querySelectorAll('#achievementList [data-preview]').forEach((button) => button.addEventListener('click', () => previewEvidence(achievements.find((item) => item.id === button.dataset.preview))));
  categories.forEach((category) => { const node = document.querySelector(`[data-count="${category}"]`); if (node) node.textContent = achievements.filter((item) => item.category === category).length; });
}

function card(item) { return `<article class="achievement"><div><span class="tag">${item.category}</span><h3>${escapeHtml(item.title || 'Untitled achievement')}</h3><p>${escapeHtml(item.details || 'No description added')} ${item.date ? `· ${item.date}` : ''}</p>${item.attachmentUrl ? `<button class="tag evidence-button" data-preview="${item.id}">View evidence${item.attachmentName ? `: ${escapeHtml(item.attachmentName)}` : ''}</button>` : item.attachmentPending ? `<span class="tag">Evidence pending setup</span>` : ''}</div><div class="actions"><button data-edit="${item.id}" aria-label="Edit ${escapeHtml(item.title || 'achievement')}">Edit</button><button data-delete="${item.id}" data-category="${item.category}" aria-label="Delete achievement">Delete</button></div></article>`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }

function previewEvidence(item) {
  if (!item?.attachmentUrl) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#18231dcc;z-index:20;display:grid;place-items:center;padding:24px';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fffefa;width:min(900px,100%);height:min(85vh,760px);padding:18px;border-radius:8px;display:flex;flex-direction:column;gap:12px';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:700';
  header.innerHTML = `<span>${escapeHtml(item.attachmentName || 'Evidence')}</span><button type="button" aria-label="Close evidence preview" style="border:0;background:none;font-size:24px;cursor:pointer">×</button>`;
  const close = () => overlay.remove();
  header.querySelector('button').addEventListener('click', close);
  const content = item.attachmentType === 'application/pdf' || item.attachmentName?.toLowerCase().endsWith('.pdf') ? document.createElement('iframe') : document.createElement('img');
  content.src = item.attachmentUrl;
  content.style.cssText = 'width:100%;height:100%;min-height:0;object-fit:contain;border:1px solid #dfe4da;background:#f5f3ec';
  content.title = item.attachmentName || 'Evidence preview';
  panel.append(header, content); overlay.append(panel); overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); }); document.body.append(overlay);
}

function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

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
  return `Student name: ${user?.displayName || 'Student'}\nStudent email: ${user?.email || ''}\nStudent Skills: ${skillNames.length ? skillNames.join(', ') : 'None listed yet'}\nAchievements and profile records:\n${JSON.stringify(records, null, 2)}`;
}

async function generateResume() {
  const output = $('resumeOutput');
  output.hidden = false;
  if ($('resumeActions')) $('resumeActions').hidden = true;
  output.textContent = 'Building your resume from your profile and skills...';
  const prompt = `${profileContext()}\n\nCreate a complete ATS-friendly student resume in plain text with sections: Summary, Education, Skills, Projects, Certifications, Competitions, Workshops, Volunteering, and Achievements. Include all skills listed in the profile context under the Skills section. Return clean text ready to copy.`;
  try {
    generatedResumeText = await sendAzureChatMessage([], prompt);
    output.textContent = generatedResumeText;
    if ($('resumeActions')) $('resumeActions').hidden = false;
  } catch {
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

function openForm(item = null) { editing = item; $('modalTitle').textContent = item ? 'Edit achievement' : 'Add achievement'; $('achievementTitle').value = item?.title || ''; $('achievementCategory').value = item?.category || 'projects'; $('achievementDate').value = item?.date || ''; $('achievementDetails').value = item?.details || ''; if (!$('achievementFile')) $('achievementDetails').insertAdjacentHTML('beforebegin', '<label for="achievementFile">Certificate or screenshot <small>(PDF/JPG/PNG, max 10 MB with Storage, 500 KB without it)</small></label><input id="achievementFile" type="file" accept="application/pdf,image/png,image/jpeg">'); $('achievementFile').value = ''; $('modal').hidden = false; $('achievementTitle').focus(); }

$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  message('');
  try {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    const isSignUp = $('authMode').value === 'signup';
    
    const result = isSignUp 
      ? await createUserWithEmailAndPassword(auth, email, password) 
      : await signInWithEmailAndPassword(auth, email, password);

    if (isSignUp && $('authName').value.trim()) {
      await updateProfile(result.user, { displayName: $('authName').value.trim() });
    }
    showDashboard(result.user);
  } catch (error) {
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
      'auth/popup-blocked': 'Sign-in popup was blocked by browser. Please allow popups.',
      'auth/unauthorized-domain': 'This domain (localhost) is not added under Firebase Console > Authentication > Settings > Authorized domains.'
    };
    message(errors[error.code] || `Google sign-in failed: ${error.message}`);
  }
});

document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => { $('authMode').value = button.dataset.authMode; document.querySelectorAll('[data-auth-mode]').forEach((item) => item.classList.toggle('active', item === button)); $('authName').hidden = button.dataset.authMode !== 'signup'; $('nameLabel').hidden = button.dataset.authMode !== 'signup'; $('authTitle').textContent = button.dataset.authMode === 'signup' ? 'Start your story.' : 'Welcome back.'; }));
$('logoutBtn').addEventListener('click', signOutUser);
$('openModal').addEventListener('click', () => openForm()); $('closeModal').addEventListener('click', () => $('modal').hidden = true); $('cancelModal').addEventListener('click', () => $('modal').hidden = true);
document.querySelector('#achievements .section-head').insertAdjacentHTML('beforeend', '<button class="add-btn" id="achievementsAdd">＋ Add</button>'); $('achievementsAdd').addEventListener('click', () => openForm());

$('achievementForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = { title: $('achievementTitle').value.trim(), date: $('achievementDate').value, details: $('achievementDetails').value.trim() };
  try {
    const file = $('achievementFile')?.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024 || !/^application\/pdf$|^image\/(png|jpeg)$/.test(file.type)) throw new Error('Choose a PDF, JPG, or PNG smaller than 10 MB.');
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
    if (editing) await updateAchievement(user.uid, editing.category, editing.id, data);
    else await addAchievement(user.uid, $('achievementCategory').value, data);
    if (data.attachmentPending) message('Achievement saved, but this file is over 500 KB. Add Storage later or use a file link.', 'achievementError');
    else { $('modal').hidden = true; message('Achievement saved.', 'dataError'); }
  } catch (error) {
    message(error.message, 'achievementError');
  }
});

$('categoryFilter').addEventListener('change', () => renderAchievements(achievements));

$('saveProfile').addEventListener('click', async () => {
  try {
    await updateProfile(user, { displayName: $('profileDisplay').value.trim() });
    $('userName').textContent = user.displayName || 'Student';
    $('avatar').textContent = ($('userName').textContent[0] || 'S').toUpperCase();
    message('Profile saved.', 'profileMessage');
  } catch (error) {
    message(error.message, 'profileMessage');
  }
});

$('addSkillForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  message('', 'skillMessage');
  const input = $('skillInput');
  const skillName = input?.value.trim();
  if (!skillName) return;
  try {
    await addSkill(user.uid, skillName);
    input.value = '';
    message('Skill added successfully.', 'skillMessage');
    setTimeout(() => message('', 'skillMessage'), 3000);
  } catch (error) {
    message(error.message, 'skillMessage');
  }
});

document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-section]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.workspace-section').forEach((section) => section.hidden = section.id !== button.dataset.section);
}));

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

  // Headers: ### Header, ## Header, # Header
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:10px 0 4px;color:var(--green);font-weight:700;font-size:14px;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:12px 0 6px;color:var(--green);font-weight:700;font-size:15px;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:14px 0 6px;color:var(--green);font-weight:700;font-size:16px;">$1</h2>');

  // Bold text: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--ink);font-weight:700;">$1</strong>');

  // Inline code / tags: `code`
  html = html.replace(/`(.*?)`/g, '<code style="background:#e6f0d9;color:#2f6b4b;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');

  // Bullet points: - item or * item
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left:18px;margin-bottom:4px;list-style-type:disc;">$1</li>');

  // Numbered lists: 1. item
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div style="margin-left:14px;margin-bottom:4px;"><strong>$1.</strong> $2</div>');

  // Paragraph breaks & line breaks
  html = html.replace(/\n\n/g, '<div style="height:8px;"></div>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// Career-oriented AI Chat Assistant
$('chatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('chatInput').value.trim();
  if (!text) return;
  
  $('messages').insertAdjacentHTML('beforeend', `<div class="message user">${escapeHtml(text)}</div>`);
  $('chatInput').value = '';

  const contextualPrompt = `${profileContext()}\n\nStudent Request (Academics / Skills / Career / Profile Guidance): ${text}`;
  try {
    let reply;
    try {
      reply = await sendAzureChatMessage(chatHistory, contextualPrompt);
    } catch {
      try {
        const result = await interactWithResumeAssistant(chatHistory, contextualPrompt);
        reply = result.isJson ? 'I formatted your background into ATS resume profile structure.' : result.data;
      } catch {
        const result = await BackendAPI.generateResumeData(contextualPrompt);
        reply = result.summary || `Recommended career skills to highlight: ${(result.skills || []).join(', ')}.`;
      }
    }
    $('messages').insertAdjacentHTML('beforeend', `<div class="message">${renderMarkdown(reply)}</div>`);
    const msgContainer = $('messages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  } catch {
    $('messages').insertAdjacentHTML('beforeend', '<div class="message">The career advisor is temporarily unavailable. You can still manage your skills and achievements.</div>');
  }
});

document.querySelector('#resume .section').insertAdjacentHTML('beforeend', '<button class="add-btn" id="generateResume">Generate resume from my profile</button><div id="resumeActions" hidden style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;"><button class="google" id="downloadResume" style="width:auto;margin:0">📄 Download PDF</button></div><pre id="resumeOutput" hidden style="white-space:pre-wrap;background:#f5f3ec;border:1px solid #dfe4da;padding:16px;border-radius:6px;margin-top:18px;line-height:1.5"></pre>');
$('generateResume').addEventListener('click', generateResume);
$('downloadResume').addEventListener('click', async () => { downloadResumePdf(); });

onAuthStateChanged(auth, (currentUser) => currentUser ? showDashboard(currentUser) : setView('auth'));
