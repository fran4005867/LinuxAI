/* =========================================================
   LinuxAI — app.js
   Linux tutor with AI + simulated terminal + gamification
   ========================================================= */

/* ---------------- STATE & PERSISTENCE ---------------- */
const STORAGE_KEY = 'linuxai_state_v1';

const DEFAULT_STATE = {
  name: '',
  level: null,
  goals: [],
  xp: 0,
  commandsLearned: [],
  completedLessons: [],
  completedExercises: [],
  achievements: [],
  streak: 0,
  lastActiveDay: null,
  apiKey: '',
  chatHistory: [],
  fs: null,
  cwd: ['home', 'guest'],
  onboarded: false
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_STATE), parsed);
  } catch (e) {
    console.warn('Could not read saved progress, starting from scratch.', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save progress.', e);
  }
}

let state = loadState();

/* ---------------- XP / LEVEL / STREAK ---------------- */
function xpForLevel(level) { return 100 * level * level; }
function currentLevelInfo() {
  let lvl = 1;
  while (state.xp >= xpForLevel(lvl + 1)) lvl++;
  const base = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  const pct = Math.min(100, Math.round(((state.xp - base) / (next - base)) * 100));
  return { level: lvl, base, next, pct };
}

function addXP(amount, reason) {
  state.xp += amount;
  touchStreak();
  saveState();
  renderSidebarStats();
  checkAchievements();
  toast(`+${amount} XP — ${reason}`);
}

function touchStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastActiveDay === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = (state.lastActiveDay === yesterday) ? state.streak + 1 : 1;
  state.lastActiveDay = today;
}

function markCommandLearned(cmd) {
  if (!state.commandsLearned.includes(cmd)) {
    state.commandsLearned.push(cmd);
    saveState();
  }
}

/* ---------------- ACHIEVEMENTS ---------------- */
const ACHIEVEMENTS = [
  { id: 'first_cmd', name: 'First contact', desc: 'You ran your first command.', check: s => s.commandsLearned.length >= 1 },
  { id: 'explorer', name: 'Directory explorer', desc: 'You used 8 different commands.', check: s => s.commandsLearned.length >= 8 },
  { id: 'sysadmin', name: 'Admin in training', desc: 'You used 15 different commands.', check: s => s.commandsLearned.length >= 15 },
  { id: 'lesson1', name: 'Diligent student', desc: 'You completed your first lesson.', check: s => s.completedLessons.length >= 1 },
  { id: 'lesson_all', name: 'Full curriculum', desc: 'You completed all lessons.', check: s => s.completedLessons.length >= LESSONS.length },
  { id: 'ex1', name: 'Hands on', desc: 'You solved your first exercise.', check: s => s.completedExercises.length >= 1 },
  { id: 'ex_all', name: 'Flawless', desc: 'You solved all exercises.', check: s => s.completedExercises.length >= EXERCISES.length },
  { id: 'streak3', name: 'Consistency', desc: '3 days in a row practicing.', check: s => s.streak >= 3 },
  { id: 'xp500', name: 'Mid-level', desc: 'You reached 500 XP.', check: s => s.xp >= 500 },
];

function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!state.achievements.includes(a.id) && a.check(state)) {
      state.achievements.push(a.id);
      saveState();
      toast(`🏆 Achievement unlocked: ${a.name}`);
    }
  });
}

/* ---------------- TOAST ---------------- */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:22px;left:50%;transform:translateX(-50%);
      background:#0f1917;border:1px solid #2aa868;color:#e9fbf3;font-family:'JetBrains Mono',monospace;
      font-size:13px;padding:12px 18px;border-radius:8px;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,.5);
      opacity:0;transition:opacity .2s, transform .2s;pointer-events:none;`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(-4px)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%)'; }, 2400);
}

/* =========================================================
   FILESYSTEM SIMULATOR
   ========================================================= */
function freshFilesystem() {
  return {
    home: { type: 'dir', children: {
      guest: { type: 'dir', children: {
        'bienvenida.txt': { type: 'file', perms: 'rw-r--r--', content: 'Welcome to LinuxAI.\nUse "help" to see available commands.\nTry: ls -la' },
        proyectos: { type: 'dir', children: {
          'robot-fran': { type: 'dir', children: {
            'main.py': { type: 'file', perms: 'rw-r--r--', content: '# controla el robot\nprint("hola mundo")' }
          }}
        }},
        scripts: { type: 'dir', children: {
          'deploy.sh': { type: 'file', perms: 'rwxr-xr-x', content: '#!/bin/bash\necho "deploying..."' }
        }}
      }}
    }},
    etc: { type: 'dir', children: {
      'hostname': { type: 'file', perms: 'rw-r--r--', content: 'linuxai-sandbox' },
      'passwd': { type: 'file', perms: 'rw-r--r--', content: 'guest:x:1000:1000::/home/guest:/bin/bash' }
    }},
    var: { type: 'dir', children: { log: { type: 'dir', children: {
      'syslog': { type: 'file', perms: 'rw-r--r--', content: 'system started ok' }
    }}}},
    tmp: { type: 'dir', children: {} }
  };
}

function ensureFs() {
  if (!state.fs) { state.fs = { type: 'dir', children: freshFilesystem() }; }
  if (!state.cwd || !state.cwd.length) state.cwd = ['home', 'guest'];
}

function resolvePath(pathParts) {
  let node = state.fs;
  for (const part of pathParts) {
    if (!node || node.type !== 'dir' || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

function normalizePath(inputPath, cwd) {
  let parts = inputPath.startsWith('/') ? [] : [...cwd];
  const segs = inputPath.split('/').filter(Boolean);
  for (const seg of segs) {
    if (seg === '.') continue;
    else if (seg === '..') parts.pop();
    else if (seg === '~') parts = ['home', 'guest'];
    else parts.push(seg);
  }
  return parts;
}

/* ---------------- COMMAND ENGINE ---------------- */
const FAKE_PACKAGES = ['htop', 'git', 'curl', 'vim', 'tree', 'neofetch', 'python3', 'nginx', 'tmux'];

function runCommand(raw, term) {
  ensureFs();
  const trimmed = raw.trim();
  if (!trimmed) return '';
  term.history.push(trimmed);
  const [cmd, ...args] = trimmed.split(/\s+/);
  markCommandLearned(cmd);

  const cwdStr = '/' + state.cwd.join('/');

  switch (cmd) {
    case 'help':
      return [
        'Available commands:',
        '  ls [-la]        list files',
        '  cd <dir>        change directory',
        '  pwd              show current directory',
        '  mkdir <dir>      create directory',
        '  touch <file>     create empty file',
        '  cat <file>       show file contents',
        '  rm [-r] <n>      delete file/folder',
        '  cp <a> <b>       copy',
        '  mv <a> <b>       move / rename',
        '  chmod <mode> <n> change permissions (e.g. chmod +x script.sh)',
        '  whoami           current user',
        '  ps               active processes (simulated)',
        '  kill <pid>       terminate a process (simulated)',
        '  grep <text> <f>  search text within a file',
        '  find <name>      find a file across the system',
        '  apt install <p>  install a package (simulated, Debian-style)',
        '  uname -a         system info',
        '  df -h            disk usage (simulated)',
        '  clear            clear screen',
        '  history          view command history'
      ].join('\n');

    case 'pwd':
      return cwdStr;

    case 'whoami':
      return 'guest';

    case 'clear':
      term.clear();
      return null;

    case 'history':
      return term.history.map((h, i) => `  ${i + 1}  ${h}`).join('\n');

    case 'uname':
      return 'Linux linuxai-sandbox 6.9.0-simulated x86_64 GNU/Linux';

    case 'df':
      return 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        40G   12G   26G  32% /';

    case 'ls': {
      const showAll = args.includes('-la') || args.includes('-al') || args.includes('-a');
      const long = args.includes('-la') || args.includes('-al') || args.includes('-l');
      const targetArg = args.find(a => !a.startsWith('-'));
      const targetPath = targetArg ? normalizePath(targetArg, state.cwd) : state.cwd;
      const node = resolvePath(targetPath);
      if (!node || node.type !== 'dir') return `ls: cannot access '${targetArg || '.'}': No such file or directory`;
      const entries = Object.entries(node.children);
      if (!entries.length) return '';
      if (long) {
        return entries.map(([name, n]) => {
          const perms = (n.type === 'dir' ? 'd' : '-') + (n.perms || 'rw-r--r--');
          const size = n.type === 'dir' ? 4096 : (n.content || '').length;
          return `${perms}  1 guest guest ${String(size).padStart(5)} ${name}${n.type === 'dir' ? '/' : ''}`;
        }).join('\n');
      }
      return entries.map(([name, n]) => name + (n.type === 'dir' ? '/' : '')).join('   ');
    }

    case 'cd': {
      const target = args[0] || '~';
      const newPath = normalizePath(target, state.cwd);
      const node = resolvePath(newPath);
      if (!node) return `cd: ${target}: No such file or directory`;
      if (node.type !== 'dir') return `cd: ${target}: Not a directory`;
      state.cwd = newPath;
      saveState();
      return null;
    }

    case 'mkdir': {
      if (!args[0]) return 'mkdir: missing operand';
      const parts = normalizePath(args[0], state.cwd);
      const name = parts.pop();
      const parent = resolvePath(parts);
      if (!parent || parent.type !== 'dir') return `mkdir: cannot create directory '${args[0]}'`;
      if (parent.children[name]) return `mkdir: cannot create directory '${args[0]}': File exists`;
      parent.children[name] = { type: 'dir', children: {} };
      saveState();
      return null;
    }

    case 'touch': {
      if (!args[0]) return 'touch: missing operand';
      const parts = normalizePath(args[0], state.cwd);
      const name = parts.pop();
      const parent = resolvePath(parts);
      if (!parent || parent.type !== 'dir') return `touch: cannot touch '${args[0]}'`;
      if (!parent.children[name]) parent.children[name] = { type: 'file', perms: 'rw-r--r--', content: '' };
      saveState();
      return null;
    }

    case 'cat': {
      if (!args[0]) return 'cat: missing operand';
      const parts = normalizePath(args[0], state.cwd);
      const node = resolvePath(parts);
      if (!node) return `cat: ${args[0]}: No such file or directory`;
      if (node.type === 'dir') return `cat: ${args[0]}: Is a directory`;
      return node.content || '(empty file)';
    }

    case 'rm': {
      const recursive = args.includes('-r') || args.includes('-rf');
      const targetArg = args.find(a => !a.startsWith('-'));
      if (!targetArg) return 'rm: missing operand';
      const parts = normalizePath(targetArg, state.cwd);
      const name = parts.pop();
      const parent = resolvePath(parts);
      if (!parent || !parent.children[name]) return `rm: cannot remove '${targetArg}': No such file or directory`;
      if (parent.children[name].type === 'dir' && !recursive && Object.keys(parent.children[name].children).length) {
        return `rm: cannot remove '${targetArg}': Is a non-empty directory (use -r)`;
      }
      delete parent.children[name];
      saveState();
      return null;
    }

    case 'cp':
    case 'mv': {
      if (!args[0] || !args[1]) return `${cmd}: source and destination required`;
      const srcParts = normalizePath(args[0], state.cwd);
      const srcNode = resolvePath(srcParts);
      if (!srcNode) return `${cmd}: cannot access '${args[0]}'`;
      const dstParts = normalizePath(args[1], state.cwd);
      const dstName = dstParts.pop();
      const dstParent = resolvePath(dstParts);
      if (!dstParent || dstParent.type !== 'dir') return `${cmd}: invalid destination`;
      dstParent.children[dstName] = structuredClone(srcNode);
      if (cmd === 'mv') {
        const srcName = srcParts.pop();
        const srcParent = resolvePath(srcParts);
        if (srcParent) delete srcParent.children[srcName];
      }
      saveState();
      return null;
    }

    case 'chmod': {
      if (!args[0] || !args[1]) return 'chmod: mode and file required';
      const parts = normalizePath(args[1], state.cwd);
      const node = resolvePath(parts);
      if (!node) return `chmod: cannot access '${args[1]}'`;
      if (args[0] === '+x') node.perms = node.perms.slice(0, 2) + 'x' + node.perms.slice(3, 5) + 'x' + node.perms.slice(6, 8) + 'x';
      else if (/^[0-7]{3}$/.test(args[0])) node.perms = octalToPerms(args[0]);
      else return `chmod: invalid mode: '${args[0]}'`;
      saveState();
      return `permissions of '${args[1]}' updated to ${node.perms}`;
    }

    case 'grep': {
      if (!args[0] || !args[1]) return 'grep: usage: grep <text> <file>';
      const term_ = args[0];
      const parts = normalizePath(args[1], state.cwd);
      const node = resolvePath(parts);
      if (!node || node.type !== 'file') return `grep: ${args[1]}: No such file`;
      const lines = (node.content || '').split('\n').filter(l => l.includes(term_));
      return lines.length ? lines.join('\n') : '(no matches)';
    }

    case 'find': {
      if (!args[0]) return 'find: missing name to search';
      const results = [];
      (function walk(node, path) {
        if (node.type === 'dir') {
          for (const [name, child] of Object.entries(node.children)) {
            const p = path + '/' + name;
            if (name.includes(args[0])) results.push(p);
            walk(child, p);
          }
        }
      })(state.fs, '');
      return results.length ? results.join('\n') : `find: no matches found for '${args[0]}'`;
    }

    case 'ps':
      return [
        '  PID TTY          TIME CMD',
        '    1 ?        00:00:01 systemd',
        '  482 ?        00:00:00 sshd',
        '  931 pts/0    00:00:00 bash',
        ' 1207 pts/0    00:00:00 ps'
      ].join('\n');

    case 'kill':
      if (!args[0]) return 'kill: missing PID';
      return `bash: SIGTERM sent to process ${args[0]}`;

    case 'apt':
    case 'pacman': {
      if (args[0] === 'install' || args[0] === '-S') {
        const pkg = args[1];
        if (!pkg) return `${cmd}: please specify a package`;
        return [`Reading package lists...`, `Installing ${pkg} (${FAKE_PACKAGES.includes(pkg) ? 'found' : 'not found in simulated repos, but proceeding'})...`, `${pkg} installed successfully ✓ (simulated)`].join('\n');
      }
      return `usage: ${cmd} install <package>`;
    }

    case 'echo': {
      const raw = trimmed.replace(/^echo\s*/, '');
      const tokens = [];
      let current = '', inQuote = false, quoteChar = '';
      for (const ch of raw) {
        if (inQuote) {
          if (ch === quoteChar) { inQuote = false; }
          else { current += ch; }
        } else if (ch === '"' || ch === "'") {
          inQuote = true; quoteChar = ch;
        } else if (ch === ' ') {
          if (current) { tokens.push(current); current = ''; }
        } else {
          current += ch;
        }
      }
      if (current) tokens.push(current);
      return tokens.join(' ');
    }

    case 'man':
      return args[0] ? `No manual pages in this simulated environment — try "help" or ask the AI Tutor about "${args[0]}".` : 'usage: man <command>';

    default:
      return `bash: ${cmd}: command not found (try "help")`;
  }
}

function octalToPerms(octal) {
  const map = { '0':'---','1':'--x','2':'-w-','3':'-wx','4':'r--','5':'r-x','6':'rw-','7':'rwx' };
  return octal.split('').map(d => map[d]).join('');
}

/* =========================================================
   TERMINAL WIDGET (reusable — used in Terminal page + Exercises)
   ========================================================= */
function createTerminal(mountEl, opts = {}) {
  const term = { history: [], el: mountEl };
  mountEl.innerHTML = `
    <div class="term-scroll" tabindex="-1"></div>
    <div class="term-inputline">
      <span class="term-prompt"></span>
      <input class="term-input" autocomplete="off" spellcheck="false" placeholder="type a command... try 'help'">
    </div>`;
  const scroll = mountEl.querySelector('.term-scroll');
  const input = mountEl.querySelector('.term-input');
  const promptEl = mountEl.querySelector('.term-prompt');

  function printPrompt() {
    ensureFs();
    const shortPath = '~/' + state.cwd.slice(2).join('/');
    promptEl.textContent = `guest@linuxai:${state.cwd.length <= 2 ? '~' : shortPath}$`;
  }
  function println(text, cls) {
    const line = document.createElement('div');
    line.className = 'term-line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    scroll.appendChild(line);
    scroll.scrollTop = scroll.scrollHeight;
  }
  term.clear = () => { scroll.innerHTML = ''; };
  term.print = println;

  if (opts.welcome) opts.welcome.forEach(l => println(l, 'term-dim'));
  printPrompt();

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const val = input.value;
    const baseCmd = val.trim().split(/\s+/)[0];
    const isNewCommand = baseCmd && !state.commandsLearned.includes(baseCmd);
    printPrompt();
    println(`${promptEl.textContent} ${val}`, 'term-cmd');
    const output = runCommand(val, term);
    if (output) println(output);
    input.value = '';
    printPrompt();
    if (opts.onRun) opts.onRun(val, isNewCommand);
  });

  mountEl.addEventListener('click', () => input.focus());
  return term;
}

/* =========================================================
   LESSONS CONTENT
   ========================================================= */
const LESSONS = [
  { id: 'l1', level: 'beginner', title: 'What is Linux and the terminal?', xp: 20,
    body: `Linux is an operating system, like Windows or macOS, but open source: anyone can view, modify, and share its code. It runs on servers, phones (Android), routers, and boards like the Raspberry Pi.
The terminal (or "shell") is a way to give instructions to the system by typing commands instead of clicking. At first it seems harder, but it's much faster and more powerful once you get the hang of it — and it's how almost any server in the world is managed.
Every command line starts with a "prompt", something like <code>guest@linuxai:~$</code>, which tells you who you are and what folder you're in.` },

  { id: 'l2', level: 'beginner', title: 'Navigating the filesystem', xp: 25,
    body: `Linux organizes everything in a single folder structure that starts at <code>/</code> (the "root"). Your personal folder is usually at <code>/home/your-username</code>.
Key commands:
<code>pwd</code> — tells you what folder you're in.
<code>ls</code> — lists the contents of the current folder. With <code>-la</code> you also see hidden files and more detail.
<code>cd folder</code> — enters a folder. <code>cd ..</code> goes up one level. <code>cd ~</code> takes you to your home.
Try these commands right now in the Terminal tab.` },

  { id: 'l3', level: 'beginner', title: 'Creating, copying, and deleting files', xp: 25,
    body: `<code>mkdir name</code> creates a new folder.
<code>touch file.txt</code> creates an empty file.
<code>cat file.txt</code> displays the contents of a file.
<code>cp source destination</code> copies a file or folder.
<code>mv source destination</code> moves or renames.
<code>rm file</code> deletes a file. <code>rm -r folder</code> deletes a folder and all its contents — there's no recycle bin in the terminal, so be careful with this on a real system!` },

  { id: 'l4', level: 'intermediate', title: 'File permissions', xp: 30,
    body: `Every file in Linux has permissions for three groups: the owner, the group, and everyone else. They look like this when you run <code>ls -la</code>: <code>rwxr-xr-x</code>.
Each block of 3 letters represents: <code>r</code> (read), <code>w</code> (write), <code>x</code> (execute).
<code>chmod +x script.sh</code> makes a file executable — very common when you download a script and need to run it.
You can also use numbers: <code>chmod 755 file</code> — each digit is the sum of r=4, w=2, x=1 for owner, group, and others respectively.` },

  { id: 'l5', level: 'intermediate', title: 'Processes', xp: 30,
    body: `Everything that runs in Linux is a "process", identified by a number (PID).
<code>ps</code> shows the active processes in your current session.
<code>kill PID</code> asks a process to terminate — useful when something hangs.
In real systems you'll also see <code>top</code> or <code>htop</code>, which show this in real time and how much CPU/memory each process uses.` },

  { id: 'l6', level: 'intermediate', title: 'Package management', xp: 30,
    body: `Every Linux distribution has its own package manager for installing programs:
Debian/Ubuntu: <code>apt install name</code>
Arch Linux: <code>pacman -S name</code>
Fedora: <code>dnf install name</code>
In this simulator you can try <code>apt install htop</code> or <code>pacman -S git</code> to see how the workflow feels, though nothing is actually installed.` },

  { id: 'l7', level: 'advanced', title: 'Basic networking', xp: 35,
    body: `Some essential networking commands in Linux (not simulated here, but good to know):
<code>ping host</code> — checks if a server responds.
<code>curl url</code> — downloads or queries a URL from the terminal.
<code>ssh user@server</code> — connects you remotely and securely to another Linux machine. This is how you administer a server or a Raspberry Pi without a monitor connected.
<code>ip a</code> — shows your network interfaces and IP addresses.` },

  { id: 'l8', level: 'advanced', title: 'Bash scripting: automate tasks', xp: 40,
    body: `A Bash script is simply a list of commands saved in a file, so you don't have to type them one by one.
It always starts with <code>#!/bin/bash</code> on the first line (the "shebang"), which tells the system which interpreter to use.
Example:
<code>#!/bin/bash
echo "Starting backup..."
mkdir -p backup
cp *.txt backup/
echo "Done."</code>
To run it you need to give it permission: <code>chmod +x script.sh</code>, and then run it with <code>./script.sh</code>.` },
];

/* =========================================================
   EXERCISES
   ========================================================= */
const EXERCISES = [
  { id: 'e1', level: 'beginner', xp: 15, title: 'Find your location',
    prompt: 'Use the command that tells you what folder you are in.',
    hint: 'It\'s a 3-letter command: pwd.',
    check: (term) => term.history.some(h => h.trim() === 'pwd') },

  { id: 'e2', level: 'beginner', xp: 15, title: 'Explore',
    prompt: 'List the contents of the current folder including hidden files and detail (long format).',
    hint: 'ls -la',
    check: (term) => term.history.some(h => /^ls\s+-la|^ls\s+-al/.test(h.trim())) },

  { id: 'e3', level: 'beginner', xp: 20, title: 'Create your folder',
    prompt: 'Create a folder called "practice" in your current directory.',
    hint: 'mkdir practice',
    check: () => { ensureFs(); const n = resolvePath(['home','guest','practice']); return !!(n && n.type === 'dir'); } },

  { id: 'e4', level: 'beginner', xp: 20, title: 'Create a file',
    prompt: 'Inside the "practice" folder, create an empty file called "notes.txt". (Tip: first cd practice)',
    hint: 'cd practice && touch notes.txt',
    check: () => { ensureFs(); const n = resolvePath(['home','guest','practice','notes.txt']); return !!(n && n.type === 'file'); } },

  { id: 'e5', level: 'intermediate', xp: 25, title: 'Give it execute permissions',
    prompt: 'Go to the scripts folder and make deploy.sh executable if it wasn\'t, by running chmod +x deploy.sh anyway to practice.',
    hint: 'cd ~/scripts && chmod +x deploy.sh',
    check: () => { ensureFs(); const n = resolvePath(['home','guest','scripts','deploy.sh']); return !!(n && n.perms && n.perms.includes('x')); } },

  { id: 'e6', level: 'intermediate', xp: 25, title: 'Search for text',
    prompt: 'Use grep to search for the word "hola" inside projects/robot-fran/main.py.',
    hint: 'grep hola projects/robot-fran/main.py (from ~)',
    check: (term) => term.history.some(h => /^grep\s+hola\s+/.test(h.trim())) },

  { id: 'e7', level: 'intermediate', xp: 25, title: 'Install a package',
    prompt: 'Simulate installing "git" with the Debian/Ubuntu package manager.',
    hint: 'apt install git',
    check: (term) => term.history.some(h => /^apt\s+install\s+git/.test(h.trim())) },

  { id: 'e8', level: 'advanced', xp: 30, title: 'Find a lost file',
    prompt: 'Use find to locate any file containing "main" across the entire system.',
    hint: 'find main',
    check: (term) => term.history.some(h => /^find\s+main/.test(h.trim())) },

  { id: 'e9', level: 'advanced', xp: 30, title: 'Processes under control',
    prompt: 'List active processes and then kill the process with PID 931.',
    hint: 'ps  →  kill 931',
    check: (term) => term.history.some(h => h.trim() === 'ps') && term.history.some(h => /^kill\s+931/.test(h.trim())) },
];

/* =========================================================
   AI TUTOR (Gemini API)
   ========================================================= */
const TUTOR_SYSTEM_PROMPT = (level, name) => `You are "Sensei", the AI tutor of LinuxAI, an app for learning Linux from scratch in English, in a clear and friendly way.
The user's name is ${name || 'the user'} and their self-declared level is: ${level || 'beginner'}.
Rules:
- Always respond in English, friendly but precise tone, like a knowledgeable Linux buddy.
- Short and concrete explanations, with real command examples when helpful. Use code blocks for commands.
- Adapt technical depth to the user's level.
- If someone asks something dangerous (e.g. "rm -rf /"), explain what it does but clearly warn about the risk.
- Don't make up commands that don't exist.
- Be brief: prefer short paragraph responses unless they ask for something extensive.`;

async function callGemini(userMessage) {
  const key = state.apiKey;
  if (!key) throw new Error('NO_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const contents = state.chatHistory.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TUTOR_SYSTEM_PROMPT(state.level, state.name) }] },
      contents
    })
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('QUOTA');
    if (res.status === 400 || res.status === 403) throw new Error('BAD_KEY');
    const errText = await res.text().catch(() => '');
    throw new Error(`API_ERROR: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '(sin respuesta)';
  return text;
}

/* Fallback canned responses when there's no API key yet, so the app is usable offline/demo */
function offlineTutorReply(msg) {
  const m = msg.toLowerCase();
  if (m.includes('permission') || m.includes('chmod') || m.includes('permiso')) return 'File permissions in Linux are controlled with chmod. For example, "chmod +x script.sh" makes a file executable. Load your Gemini API key above for more complete and personalized responses 🙂';
  if (m.includes('ls')) return '"ls" lists the contents of a folder. Add "-la" to also see hidden files and more detail: "ls -la".';
  if (m.includes('cd')) return '"cd" changes folder. "cd .." goes up one level, "cd ~" takes you to your home.';
  return 'I\'m in demo mode (no API key configured). I can answer some basic questions, but for the full tutor load your free Google AI Studio API key above. In the meantime, try the Terminal or Lessons tab.';
}

/* =========================================================
   RENDER: SIDEBAR STATS
   ========================================================= */
function renderSidebarStats() {
  const info = currentLevelInfo();
  document.getElementById('side-level').textContent = info.level;
  document.getElementById('side-xp').textContent = state.xp;
  document.getElementById('side-bar').style.width = info.pct + '%';
}

/* =========================================================
   PAGE: TUTOR
   ========================================================= */
function renderTutorPage() {
  return `
  <div class="page-head">
    <div class="page-title">AI Tutor</div>
    <div class="page-sub">Ask anything about Linux. Responses are tailored to your level: ${levelLabel(state.level)}.</div>
  </div>
  <div class="win" style="margin-bottom:16px;">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">gemini — api key</span></div>
    <div class="win-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <input id="api-key-input" type="password" placeholder="Paste your Google AI Studio API key (free)" value="${escapeHtml(state.apiKey)}"
        style="flex:1;min-width:220px;background:var(--bg-input);border:1px solid var(--line-bright);border-radius:8px;padding:10px 12px;color:var(--text-hi);font-family:var(--mono);font-size:13px;">
      <button class="btn btn-ghost btn-small" id="save-key-btn">Save</button>
      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;color:var(--text-dim);">get free key ↗</a>
    </div>
  </div>
  <div class="win">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">sensei — linux tutor</span></div>
    <div class="win-body" style="padding:0;">
      <div id="chat-log" style="height:420px;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px;"></div>
      <div style="display:flex;gap:10px;padding:14px;border-top:1px solid var(--line);">
        <input id="chat-input" type="text" placeholder="Type your question about Linux..." style="flex:1;background:var(--bg-input);border:1px solid var(--line-bright);border-radius:8px;padding:11px 14px;color:var(--text-hi);font-family:var(--sans);font-size:14px;">
        <button class="btn btn-primary btn-small" id="chat-send">Send</button>
      </div>
    </div>
  </div>`;
}

function chatBubbleHtml(role, text) {
  const isUser = role === 'user';
  return `<div style="align-self:${isUser ? 'flex-end' : 'flex-start'};max-width:80%;">
    <div style="font-family:var(--mono);font-size:10px;color:var(--text-dim);margin-bottom:4px;${isUser ? 'text-align:right;' : ''}">${isUser ? state.name || 'you' : 'Sensei'}</div>
    <div style="background:${isUser ? 'var(--phosphor-dark)' : 'var(--bg-panel-raised)'};border:1px solid ${isUser ? 'var(--phosphor-dim)' : 'var(--line)'};border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.55;color:var(--text-hi);white-space:pre-wrap;">${formatTutorText(text)}</div>
  </div>`;
}

function formatTutorText(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/```([\s\S]*?)```/g, '<pre style="background:var(--bg-input);border:1px solid var(--line);border-radius:6px;padding:10px;overflow-x:auto;font-family:var(--mono);font-size:12.5px;margin:6px 0;">$1</pre>')
                .replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:2px 5px;border-radius:4px;font-family:var(--mono);font-size:12.5px;color:var(--phosphor);">$1</code>');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function wireTutorPage() {
  const log = document.getElementById('chat-log');
  function renderLog() {
    log.innerHTML = state.chatHistory.map(m => chatBubbleHtml(m.role, m.text)).join('') ||
      `<div style="font-family:var(--mono);font-size:13px;color:var(--text-dim);">Sensei is ready. Ask something like "what is sudo?" or "explain file permissions".</div>`;
    log.scrollTop = log.scrollHeight;
  }
  renderLog();

  document.getElementById('save-key-btn').onclick = () => {
    state.apiKey = document.getElementById('api-key-input').value.trim();
    saveState();
    toast('API key saved to your browser (localStorage)');
  };

  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  async function doSend() {
    const val = input.value.trim();
    if (!val) return;
    state.chatHistory.push({ role: 'user', text: val });
    input.value = '';
    renderLog();
    saveState();
    log.insertAdjacentHTML('beforeend', `<div id="typing-ind" style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">Sensei is typing...</div>`);
    log.scrollTop = log.scrollHeight;
    try {
      let reply;
      if (state.apiKey) reply = await callGemini(val);
      else reply = offlineTutorReply(val);
      document.getElementById('typing-ind')?.remove();
      state.chatHistory.push({ role: 'assistant', text: reply });
      addXP(3, 'tutor question');
      renderLog();
      saveState();
    } catch (e) {
      document.getElementById('typing-ind')?.remove();
      let msg;
      if (e.message === 'NO_KEY') {
        msg = 'You don\'t have an API key loaded, so I\'m responding in demo mode.';
      } else if (e.message === 'QUOTA') {
        msg = 'The free Gemini API quota has been reached for now (error 429) — it\'s not a problem with your key. The free tier has a limit per minute and per day. Wait a while and try again, or check your usage at aistudio.google.com/app/apikey. In the meantime, I\'ll keep responding in demo mode.';
      } else if (e.message === 'BAD_KEY') {
        msg = 'The API key appears to be invalid or missing permissions (authentication error). Make sure you copied it completely from Google AI Studio.';
      } else {
        msg = `There was an error consulting the AI (${e.message}).`;
      }
      state.chatHistory.push({ role: 'assistant', text: msg + '\n\n' + offlineTutorReply(val) });
      renderLog();
      saveState();
    }
  }
  send.onclick = doSend;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

/* =========================================================
   PAGE: TERMINAL
   ========================================================= */
function renderTerminalPage() {
  return `
  <div class="page-head">
    <div class="page-title">Terminal</div>
    <div class="page-sub">A simulated Linux terminal, 100% in your browser. You can't break anything real here — practice freely.</div>
  </div>
  <div class="win">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">guest@linuxai — bash</span></div>
    <div class="win-body" style="padding:0;">
      <div id="terminal-mount" class="terminal-widget"></div>
    </div>
  </div>`;
}

function wireTerminalPage() {
  const mount = document.getElementById('terminal-mount');
  createTerminal(mount, {
    welcome: [
      'LinuxAI sandbox v1.0 — simulated terminal',
      `Welcome, ${state.name || 'guest'}. Type "help" to see available commands.`, ''
    ],
    onRun: (cmd, isNew) => { saveState(); renderSidebarStats(); checkAchievements(); if (isNew) addXP(1, 'new command learned'); }
  });
}

/* =========================================================
   PAGE: LESSONS
   ========================================================= */
function levelLabel(l) { return { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[l] || 'Beginner'; }
function levelRank(l) { return { beginner: 0, intermediate: 1, advanced: 2 }[l] ?? 0; }

function renderLessonsPage() {
  const userRank = levelRank(state.level);
  const cards = LESSONS.map(l => {
    const done = state.completedLessons.includes(l.id);
    const locked = levelRank(l.level) > userRank + 1;
    return `<div class="win lesson-card" data-id="${l.id}" style="${locked ? 'opacity:.45;' : ''}">
      <div class="win-bar">
        <span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span>
        <span class="win-title">${l.id}.md — ${levelLabel(l.level)}</span>
        ${done ? '<span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--phosphor);">✓ complete</span>' : `<span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--text-dim);">+${l.xp} XP</span>`}
      </div>
      <div class="win-body">
        <div style="font-family:var(--mono);font-weight:700;color:var(--text-hi);font-size:16px;margin-bottom:10px;">${l.title}</div>
        <div class="lesson-body" style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-line;">${formatLessonBody(l.body)}</div>
        ${!done && !locked ? `<button class="btn btn-primary btn-small lesson-complete" data-id="${l.id}" style="margin-top:14px;">Mark as complete (+${l.xp} XP)</button>` : ''}
        ${locked ? `<div style="margin-top:14px;font-family:var(--mono);font-size:12px;color:var(--text-dim);">🔒 level up to unlock</div>` : ''}
      </div>
    </div>`;
  }).join('<div style="height:16px;"></div>');

  return `
  <div class="page-head">
    <div class="page-title">Lessons</div>
    <div class="page-sub">Progressive curriculum: from basic terminal to scripting. Mark each lesson as complete when you finish it to earn XP.</div>
  </div>
  ${cards}`;
}

function formatLessonBody(body) {
  return escapeHtml(body).replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:13px;color:var(--phosphor);">$1</code>').replace(/&lt;code&gt;/g,'').replace(/&lt;\/code&gt;/g,'');
}

function wireLessonsPage() {
  document.querySelectorAll('.lesson-complete').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const lesson = LESSONS.find(l => l.id === id);
      if (state.completedLessons.includes(id)) return;
      state.completedLessons.push(id);
      saveState();
      addXP(lesson.xp, `lesson "${lesson.title}" completed`);
      goToPage('lessons');
    };
  });
}

/* =========================================================
   PAGE: EXERCISES
   ========================================================= */
let exerciseTerm = null;

function renderExercisesPage() {
  const userRank = levelRank(state.level);
  const items = EXERCISES.filter(e => levelRank(e.level) <= userRank + 1).map(e => {
    const done = state.completedExercises.includes(e.id);
    return `<div class="ex-item" data-id="${e.id}" style="border:1px solid ${done ? 'var(--phosphor-dim)' : 'var(--line)'};border-radius:8px;padding:14px 16px;margin-bottom:10px;background:var(--bg-panel);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-family:var(--mono);font-weight:700;color:var(--text-hi);font-size:14px;">${done ? '✓ ' : ''}${e.title} <span style="color:var(--text-dim);font-weight:400;">· ${levelLabel(e.level)} · +${e.xp} XP</span></div>
          <div style="font-size:13px;color:var(--text);margin-top:6px;">${e.prompt}</div>
        </div>
        <button class="btn btn-ghost btn-small ex-check" data-id="${e.id}">${done ? 'Solved' : 'Verify'}</button>
      </div>
      <details style="margin-top:8px;"><summary style="font-family:var(--mono);font-size:11px;color:var(--text-dim);cursor:pointer;">show hint</summary><div style="font-family:var(--mono);font-size:12px;color:var(--cyan);margin-top:6px;">${e.hint}</div></details>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div class="page-title">Exercises</div>
    <div class="page-sub">Solve each challenge using the terminal below. Click "Verify" when you think you've got it.</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr;gap:0;">
    <div>${items}</div>
    <div class="win" style="margin-top:8px;">
      <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">guest@linuxai — exercises</span></div>
      <div class="win-body" style="padding:0;"><div id="exercise-terminal-mount" class="terminal-widget"></div></div>
    </div>
  </div>`;
}

function wireExercisesPage() {
  const mount = document.getElementById('exercise-terminal-mount');
  exerciseTerm = createTerminal(mount, {
    welcome: ['Practice terminal — shares the same filesystem as the Terminal tab.', ''],
    onRun: () => { saveState(); renderSidebarStats(); checkAchievements(); }
  });
  document.querySelectorAll('.ex-check').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const ex = EXERCISES.find(e => e.id === id);
      const ok = ex.check(exerciseTerm);
      if (ok) {
        if (!state.completedExercises.includes(id)) {
          state.completedExercises.push(id);
          saveState();
          addXP(ex.xp, `exercise "${ex.title}" solved`);
        }
        toast(`✓ Correct! ${ex.title}`);
        goToPage('exercises');
      } else {
        toast('Not yet — try the command and verify again.');
      }
    };
  });
}

/* =========================================================
   PAGE: DASHBOARD
   ========================================================= */
function renderDashboardPage() {
  const info = currentLevelInfo();
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id));
  const locked = ACHIEVEMENTS.filter(a => !state.achievements.includes(a.id));

  const statCard = (label, value) => `<div class="win" style="text-align:center;padding:22px 10px;">
      <div style="font-family:var(--mono);font-size:30px;font-weight:800;color:var(--phosphor);">${value}</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);margin-top:6px;letter-spacing:.04em;">${label}</div>
    </div>`;

  return `
  <div class="page-head">
    <div class="page-title">Your progress</div>
    <div class="page-sub">${state.name ? state.name + ', this' : 'This'} is what you've covered so far.</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:22px;">
    ${statCard('LEVEL', info.level)}
    ${statCard('TOTAL XP', state.xp)}
    ${statCard('STREAK (days)', state.streak)}
    ${statCard('COMMANDS LEARNED', state.commandsLearned.length)}
    ${statCard('LESSONS', state.completedLessons.length + '/' + LESSONS.length)}
    ${statCard('EXERCISES', state.completedExercises.length + '/' + EXERCISES.length)}
  </div>

  <div class="win" style="margin-bottom:18px;">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">level ${info.level} → ${info.level + 1}</span></div>
    <div class="win-body">
      <div class="bar-track" style="height:10px;"><div class="bar-fill" style="width:${info.pct}%;"></div></div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);margin-top:8px;">${state.xp - info.base} / ${info.next - info.base} XP to next level</div>
    </div>
  </div>

  <div class="win" style="margin-bottom:18px;">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">commands you've used</span></div>
    <div class="win-body">
      ${state.commandsLearned.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${state.commandsLearned.map(c => `<span style="font-family:var(--mono);font-size:12px;background:var(--bg-input);border:1px solid var(--line-bright);color:var(--phosphor);padding:5px 10px;border-radius:6px;">${escapeHtml(c)}</span>`).join('')}</div>`
        : `<div style="font-family:var(--mono);font-size:13px;color:var(--text-dim);">You haven't used any commands yet — head to the Terminal.</div>`}
    </div>
  </div>

  <div class="win">
    <div class="win-bar"><span class="win-dot r"></span><span class="win-dot y"></span><span class="win-dot g"></span><span class="win-title">achievements — ${unlocked.length}/${ACHIEVEMENTS.length}</span></div>
    <div class="win-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
        ${unlocked.map(a => `<div style="border:1px solid var(--phosphor-dim);background:var(--phosphor-dark);border-radius:8px;padding:12px;">
            <div style="font-family:var(--mono);font-size:13px;color:var(--phosphor);font-weight:700;">🏆 ${a.name}</div>
            <div style="font-size:12px;color:var(--text);margin-top:4px;">${a.desc}</div></div>`).join('')}
        ${locked.map(a => `<div style="border:1px solid var(--line);border-radius:8px;padding:12px;opacity:.5;">
            <div style="font-family:var(--mono);font-size:13px;color:var(--text-dim);font-weight:700;">🔒 ${a.name}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${a.desc}</div></div>`).join('')}
      </div>
    </div>
  </div>`;
}

/* =========================================================
   PAGE ROUTING
   ========================================================= */
const PAGES = {
  tutor: { render: renderTutorPage, wire: wireTutorPage },
  terminal: { render: renderTerminalPage, wire: wireTerminalPage },
  lessons: { render: renderLessonsPage, wire: wireLessonsPage },
  exercises: { render: renderExercisesPage, wire: wireExercisesPage },
  dashboard: { render: renderDashboardPage, wire: null },
};

function goToPage(name) {
  const page = PAGES[name];
  if (!page) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === name));
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page active">${page.render()}</div>`;
  if (page.wire) page.wire();
  renderSidebarStats();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => goToPage(btn.dataset.page));
});

/* =========================================================
   ONBOARDING SCREEN LOGIC
   ========================================================= */
let selectedLevel = null;
const selectedGoals = new Set();

function updateStartButton() {
  const nameOk = document.getElementById('input-name').value.trim().length > 0;
  const btn = document.getElementById('btn-start');
  const hint = document.getElementById('start-hint');
  const ready = nameOk && selectedLevel;
  btn.disabled = !ready;
  hint.textContent = ready ? 'ready — let\'s go ✓' : (!nameOk ? 'enter your name' : 'choose a level');
}

document.getElementById('input-name').addEventListener('input', updateStartButton);

document.querySelectorAll('.level-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedLevel = card.dataset.level;
    updateStartButton();
  });
});

document.querySelectorAll('#goal-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const g = chip.dataset.goal;
    if (selectedGoals.has(g)) { selectedGoals.delete(g); chip.classList.remove('selected'); }
    else { selectedGoals.add(g); chip.classList.add('selected'); }
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  state.name = document.getElementById('input-name').value.trim();
  state.level = selectedLevel;
  state.goals = [...selectedGoals];
  state.onboarded = true;
  ensureFs();
  saveState();
  document.getElementById('onboard-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  goToPage('tutor');
});

/* Typed command animation on the onboarding prompt line */
function typeLoop() {
  const el = document.getElementById('typed-cmd');
  if (!el) return;
  const phrases = ['sudo apt install curiosity', './learn-linux.sh --level beginner', 'echo "let\'s do this"'];
  let pi = 0, ci = 0, deleting = false;
  function tick() {
    const phrase = phrases[pi];
    el.textContent = phrase.slice(0, ci);
    if (!deleting && ci < phrase.length) { ci++; setTimeout(tick, 45); }
    else if (!deleting && ci === phrase.length) { deleting = true; setTimeout(tick, 1400); }
    else if (deleting && ci > 0) { ci--; setTimeout(tick, 22); }
    else { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(tick, 300); }
  }
  tick();
}

/* =========================================================
   BOOT SEQUENCE
   ========================================================= */
const BOOT_LINES = [
  { t: '[  OK  ] Starting LinuxAI sandbox v1.0', cls: 'ok' },
  { t: '[  OK  ] Mounting simulated filesystem at /', cls: 'ok' },
  { t: '[  OK  ] Loading interactive terminal module' , cls: 'ok'},
  { t: '[  OK  ] Connecting AI tutor (Sensei)', cls: 'ok' },
  { t: '[ WARN ] No API key configured yet — demo mode active', cls: 'warn' },
  { t: '[  OK  ] Loading lesson curriculum (8 modules)', cls: 'ok' },
  { t: '[  OK  ] Loading exercise bank (9 challenges)', cls: 'ok' },
  { t: '[  OK  ] Ready.', cls: 'ok' },
];

function runBoot() {
  const log = document.getElementById('boot-log');
  const bootScreen = document.getElementById('boot-screen');
  const onboard = document.getElementById('onboard-screen');
  let i = 0;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    bootScreen.classList.add('hidden');
    if (state.onboarded && state.name && state.level) {
      onboard.classList.remove('active');
      document.getElementById('app-screen').classList.add('active');
      selectedLevel = state.level;
      goToPage(document.querySelector('.nav-item.active')?.dataset.page || 'tutor');
    } else {
      onboard.classList.add('active');
      typeLoop();
    }
  }

  function showNext() {
    if (i >= BOOT_LINES.length) { setTimeout(finish, 350); return; }
    const { t, cls } = BOOT_LINES[i];
    const line = document.createElement('div');
    line.className = 'boot-line ' + (cls || '');
    line.textContent = t;
    log.appendChild(line);
    requestAnimationFrame(() => line.classList.add('show'));
    i++;
    setTimeout(showNext, 260);
  }
  showNext();

  document.getElementById('boot-skip').addEventListener('click', finish);
}

/* =========================================================
   INIT
   ========================================================= */
ensureFs();
renderSidebarStats();
runBoot();
