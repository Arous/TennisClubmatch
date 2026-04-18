(() => {
  "use strict";

  const STORAGE_KEY = "tennis-club-match-state-v2";
  const LEGACY_STORAGE_KEYS = ["tennis-club-match-state-v1"];
  const SYNC_CONFIG_KEY = "tennis-club-match-sync-config-v1";
  const DEFAULT_TIME_CONFIG = {
    start: "14:00",
    end: "17:00",
    interval: 30,
  };
  const SYNC_TABLE = "shared_match_states";
  const DEFAULT_SYNC_MATCH_ID = "friendly-match-room";
  const DEFAULT_SUPABASE_URL = "https://isfkbxyjagwmfcdpemqb.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzZmtieHlqYWd3bWZjZHBlbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTY4MDAsImV4cCI6MjA5MjAzMjgwMH0.6DmacuS3uD59s7L_VAwwNBlP4Vi6GhPsPkOhdKv48M8";

  const MATCH_TYPE = {
    male: { code: "male", label: "남복" },
    female: { code: "female", label: "여복" },
    mixed: { code: "mixed", label: "혼복" },
    open: { code: "open", label: "잡복" },
    pending: { code: "pending", label: "미정" },
  };

  const el = {
    matchNameInput: document.getElementById("matchNameInput"),
    matchDateInput: document.getElementById("matchDateInput"),
    matchLocationInput: document.getElementById("matchLocationInput"),
    saveNowBtn: document.getElementById("saveNowBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFileInput: document.getElementById("importFileInput"),
    resetBtn: document.getElementById("resetBtn"),
    saveStatus: document.getElementById("saveStatus"),
    supabaseUrlInput: document.getElementById("supabaseUrlInput"),
    supabaseAnonKeyInput: document.getElementById("supabaseAnonKeyInput"),
    syncMatchIdInput: document.getElementById("syncMatchIdInput"),
    syncWritePasswordInput: document.getElementById("syncWritePasswordInput"),
    connectSyncBtn: document.getElementById("connectSyncBtn"),
    disconnectSyncBtn: document.getElementById("disconnectSyncBtn"),
    syncStatus: document.getElementById("syncStatus"),

    addCourtBtn: document.getElementById("addCourtBtn"),
    applyTimeConfigBtn: document.getElementById("applyTimeConfigBtn"),
    timeStartInput: document.getElementById("timeStartInput"),
    timeEndInput: document.getElementById("timeEndInput"),
    slotMinutesInput: document.getElementById("slotMinutesInput"),

    clubsContainer: document.getElementById("clubsContainer"),
    scheduleTable: document.getElementById("scheduleTable"),
    tableWrap: document.getElementById("tableWrap"),
    nowLine: document.getElementById("nowLine"),
    nowLineLabel: document.getElementById("nowLineLabel"),

    clubStats: document.getElementById("clubStats"),
    playerStats: document.getElementById("playerStats"),
    topWinnerBox: document.getElementById("topWinnerBox"),
    trendGraphWrap: document.getElementById("trendGraphWrap"),
    trendGraphHint: document.getElementById("trendGraphHint"),

    matchModal: document.getElementById("matchModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    cancelModalBtn: document.getElementById("cancelModalBtn"),
    modalTitle: document.getElementById("modalTitle"),
    clubAName: document.getElementById("clubAName"),
    clubBName: document.getElementById("clubBName"),
    clubASelected: document.getElementById("clubASelected"),
    clubBSelected: document.getElementById("clubBSelected"),
    clubAPlayerPool: document.getElementById("clubAPlayerPool"),
    clubBPlayerPool: document.getElementById("clubBPlayerPool"),

    scoreAInput: document.getElementById("scoreAInput"),
    scoreBInput: document.getElementById("scoreBInput"),
    scoreLabelA: document.getElementById("scoreLabelA"),
    scoreLabelB: document.getElementById("scoreLabelB"),
    matchTypeBadge: document.getElementById("matchTypeBadge"),
    matchMemoInput: document.getElementById("matchMemoInput"),
    matchForm: document.getElementById("matchForm"),
    deleteMatchBtn: document.getElementById("deleteMatchBtn"),

    appDialog: document.getElementById("appDialog"),
    appDialogTitle: document.getElementById("appDialogTitle"),
    appDialogMessage: document.getElementById("appDialogMessage"),
    appDialogInputWrap: document.getElementById("appDialogInputWrap"),
    appDialogInputLabel: document.getElementById("appDialogInputLabel"),
    appDialogInput: document.getElementById("appDialogInput"),
    appDialogCloseBtn: document.getElementById("appDialogCloseBtn"),
    appDialogCancelBtn: document.getElementById("appDialogCancelBtn"),
    appDialogConfirmBtn: document.getElementById("appDialogConfirmBtn"),
  };

  let state = normalizeState(loadState());
  let activeSlotKey = null;
  let modalDraft = null;
  let editingPlayer = null;
  let playerSortState = [defaultPlayerSort(), defaultPlayerSort()];
  let saveHintTimer = null;
  let nowLineTimer = null;
  let pendingNameToggleTimer = null;
  let draggingSlotKey = "";
  let suppressSlotClickUntil = 0;
  let syncConfig = normalizeSyncConfig(loadSyncConfig());
  let syncClient = null;
  let syncChannel = null;
  let syncClientId = createId("sync-client");
  let syncPushTimer = null;
  let syncPushInFlight = false;
  let syncPushQueued = false;
  let syncPullInProgress = false;
  let syncConnected = false;
  let dialogQueue = [];
  let activeDialogJob = null;

  init();

  function init() {
    bindGlobalEvents();
    renderAll();
    startNowLineTimer();
    renderSyncConfigInputs();
    renderSyncStatus("클라우드 동기화 꺼짐");
    setSyncButtonsState(false);
    attemptAutoConnectSync();
  }

  function bindGlobalEvents() {
    el.matchNameInput.addEventListener("input", (event) => {
      state.matchName = event.target.value;
      saveState(false);
    });

    el.matchDateInput.addEventListener("input", (event) => {
      state.matchDate = event.target.value;
      saveState(false);
    });

    el.matchLocationInput.addEventListener("input", (event) => {
      state.matchLocation = event.target.value;
      saveState(false);
    });

    el.saveNowBtn.addEventListener("click", async () => {
      const latestWritePassword = String(el.syncWritePasswordInput?.value || "").trim();
      if (latestWritePassword !== syncConfig.writePassword) {
        saveSyncConfig({ ...syncConfig, writePassword: latestWritePassword });
      }

      const allowCloudSync = await requestCloudSaveApproval();
      saveState(true, {
        forceSync: allowCloudSync,
        skipSync: syncConnected && !allowCloudSync,
        saveMessage: allowCloudSync ? "저장 완료" : "로컬 저장 완료 (클라우드 미반영)",
      });
    });

    el.exportBtn.addEventListener("click", downloadAutoBackupJson);
    el.importBtn.addEventListener("click", () => {
      el.importFileInput.click();
    });
    el.importFileInput.addEventListener("change", importFromFile);
    if (el.connectSyncBtn) {
      el.connectSyncBtn.addEventListener("click", connectSupabaseSync);
    }
    if (el.disconnectSyncBtn) {
      el.disconnectSyncBtn.addEventListener("click", disconnectSupabaseSync);
    }

    el.resetBtn.addEventListener("click", async () => {
      const ok = await appConfirm("모든 데이터를 초기화할까요? 기존 기록은 삭제됩니다.", {
        title: "초기화 확인",
        confirmText: "초기화",
        confirmTone: "danger",
      });
      if (!ok) {
        return;
      }
      state = defaultState();
      editingPlayer = null;
      playerSortState = [defaultPlayerSort(), defaultPlayerSort()];
      renderAll();
      saveState(true, { skipSync: true, saveMessage: "로컬 초기화 완료 (클라우드 미반영)" });
      if (syncConnected) {
        renderSyncStatus("초기화는 로컬에만 적용됨 (클라우드 미반영)");
      }
    });

    el.addCourtBtn.addEventListener("click", () => {
      const nextNumber = state.courts.length + 1;
      state.courts.push({
        id: createId("court"),
        name: `코트${nextNumber}`,
      });
      renderSchedule();
      saveState(true);
    });

    el.applyTimeConfigBtn.addEventListener("click", applyTimeConfigFromInputs);

    el.clubsContainer.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!form.classList.contains("player-form")) {
        return;
      }

      event.preventDefault();
      const clubIndex = Number(form.dataset.clubIndex);
      if (!Number.isInteger(clubIndex)) {
        return;
      }

      const rawNames = String(form.elements.namedItem("name").value || "").trim();
      const gender = String(form.elements.namedItem("gender").value || "");

      if (!rawNames || (gender !== "M" && gender !== "F")) {
        await appAlert("이름과 성별은 필수입니다.", { title: "입력 확인" });
        return;
      }

      const names = parseBulkPlayerNames(rawNames);
      if (names.length === 0) {
        await appAlert("선수 이름을 입력해 주세요. 쉼표로 여러 명 입력할 수 있습니다.", { title: "입력 확인" });
        return;
      }

      names.forEach((name) => {
        state.clubs[clubIndex].players.push({
          id: createId("player"),
          name,
          gender,
          experience: "",
          age: "",
        });
      });

      form.reset();
      const hiddenGender = form.elements.namedItem("gender");
      if (hiddenGender) {
        hiddenGender.value = "M";
      }
      const addToggle = form.querySelector(".add-gender-toggle");
      if (addToggle) {
        setToggleActive(addToggle, "M");
      }
      editingPlayer = null;

      renderClubs();
      renderSchedule();
      renderStats();
      refreshModalIfOpen();
      saveState(true);
    });

    el.clubsContainer.addEventListener("input", (event) => {
      const target = event.target;

      if (target.classList.contains("club-name-input")) {
        const clubIndex = Number(target.dataset.clubIndex);
        if (!Number.isInteger(clubIndex)) {
          return;
        }
        state.clubs[clubIndex].name = target.value;
        renderSchedule();
        renderStats();
        renderModalClubNames();
        saveState(false);
      }
    });

    el.clubsContainer.addEventListener("dblclick", (event) => {
      const nameDisplay = event.target.closest(".player-name-display");
      if (!nameDisplay) {
        return;
      }
      clearPendingNameToggle();

      const clubIndex = Number(nameDisplay.dataset.clubIndex);
      const playerId = String(nameDisplay.dataset.playerId || "");
      if (!Number.isInteger(clubIndex) || !playerId) {
        return;
      }

      editingPlayer = { clubIndex, playerId };
      renderClubs();
    });

    el.clubsContainer.addEventListener("keydown", (event) => {
      const input = event.target.closest(".player-name-edit-input");
      if (!input) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        commitPlayerNameEdit(input, { saveIfBlank: false });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelPlayerNameEdit();
      }
    });

    el.clubsContainer.addEventListener("focusout", (event) => {
      const input = event.target.closest(".player-name-edit-input");
      if (!input) {
        return;
      }

      commitPlayerNameEdit(input, { saveIfBlank: false });
    });

    el.clubsContainer.addEventListener("click", async (event) => {
      const nameDisplay = event.target.closest(".player-name-display");
      if (nameDisplay) {
        const clubIndex = Number(nameDisplay.dataset.clubIndex);
        const playerId = String(nameDisplay.dataset.playerId || "");
        if (!Number.isInteger(clubIndex) || !playerId) {
          return;
        }

        clearPendingNameToggle();
        pendingNameToggleTimer = window.setTimeout(() => {
          pendingNameToggleTimer = null;
          togglePlayerGender(clubIndex, playerId);
        }, 220);
        return;
      }

      const genderBtn = event.target.closest(".gender-btn");
      if (genderBtn) {
        clearPendingNameToggle();
        const toggle = genderBtn.closest(".gender-toggle");
        if (!toggle) {
          return;
        }

        const nextGender = genderBtn.dataset.genderValue;
        if (nextGender !== "M" && nextGender !== "F") {
          return;
        }

        setToggleActive(toggle, nextGender);

        if (toggle.classList.contains("add-gender-toggle")) {
          const hidden = toggle.querySelector("input[name='gender']");
          if (hidden) {
            hidden.value = nextGender;
          }
          return;
        }

        if (toggle.classList.contains("player-gender-toggle")) {
          const clubIndex = Number(toggle.dataset.clubIndex);
          const playerId = toggle.dataset.playerId;
          updatePlayerGender(clubIndex, playerId, nextGender);
          return;
        }
      }

      const removeBtn = event.target.closest(".remove-player-btn");
      if (removeBtn) {
        clearPendingNameToggle();
        const clubIndex = Number(removeBtn.dataset.clubIndex);
        const playerId = removeBtn.dataset.playerId;
        if (!Number.isInteger(clubIndex) || !playerId) {
          return;
        }

        const player = findPlayerById(clubIndex, playerId);
        if (!player) {
          return;
        }

        const connectedMatches = countMatchesByPlayerId(playerId);
        let message = `선수 \"${player.name || "이름없음"}\" 을(를) 삭제할까요?`;
        if (connectedMatches > 0) {
          message += `\n해당 선수는 ${connectedMatches}개 경기 슬롯에 배정되어 있어, 삭제 시 슬롯에서 자동 제거됩니다.`;
        }

        const ok = await appConfirm(message, {
          title: "선수 삭제 확인",
          confirmText: "삭제",
          confirmTone: "danger",
        });
        if (!ok) {
          return;
        }

        removePlayer(clubIndex, playerId);
        renderAll();
        saveState(true);
      }
    });

    el.scheduleTable.addEventListener("click", async (event) => {
      const removeCourtBtn = event.target.closest(".court-remove-btn");
      if (removeCourtBtn) {
        const courtId = removeCourtBtn.dataset.courtId;
        await removeCourt(courtId);
        return;
      }

      const slotBtn = event.target.closest(".slot-btn");
      if (!slotBtn) {
        return;
      }
      if (Date.now() < suppressSlotClickUntil) {
        event.preventDefault();
        return;
      }

      const slotKey = slotBtn.dataset.slotKey;
      if (!slotKey) {
        return;
      }

      openMatchModal(slotKey);
    });

    el.scheduleTable.addEventListener("dragstart", handleScheduleDragStart);
    el.scheduleTable.addEventListener("dragover", handleScheduleDragOver);
    el.scheduleTable.addEventListener("dragleave", handleScheduleDragLeave);
    el.scheduleTable.addEventListener("drop", handleScheduleDrop);
    el.scheduleTable.addEventListener("dragend", handleScheduleDragEnd);

    el.matchForm.addEventListener("click", handleModalPickerClick);
    el.matchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveMatchFromModal();
    });

    el.scoreAInput.addEventListener("input", updateMatchTypeBadgeFromModal);
    el.scoreBInput.addEventListener("input", updateMatchTypeBadgeFromModal);

    el.playerStats.addEventListener("click", (event) => {
      const sortBtn = event.target.closest(".stats-sort-btn");
      if (!sortBtn) {
        return;
      }

      const clubIndex = Number(sortBtn.dataset.clubIndex);
      const sortKey = String(sortBtn.dataset.sortKey || "");
      if (!Number.isInteger(clubIndex) || clubIndex < 0 || clubIndex > 1) {
        return;
      }
      if (!isValidPlayerSortKey(sortKey)) {
        return;
      }

      updatePlayerSort(clubIndex, sortKey);
      renderStats();
    });

    el.deleteMatchBtn.addEventListener("click", async () => {
      if (!activeSlotKey || !state.matches[activeSlotKey]) {
        closeMatchModal();
        return;
      }
      const ok = await appConfirm("이 슬롯의 경기를 삭제할까요?", {
        title: "경기 삭제 확인",
        confirmText: "삭제",
        confirmTone: "danger",
      });
      if (!ok) {
        return;
      }

      delete state.matches[activeSlotKey];
      closeMatchModal();
      renderSchedule();
      renderStats();
      saveState(true);
    });

    el.closeModalBtn.addEventListener("click", closeMatchModal);
    el.cancelModalBtn.addEventListener("click", closeMatchModal);

    el.matchModal.addEventListener("click", (event) => {
      if (event.target === el.matchModal) {
        closeMatchModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (el.appDialog && !el.appDialog.classList.contains("hidden")) {
        if (event.key === "Escape") {
          event.preventDefault();
          resolveActiveDialog({ confirmed: false, dismissed: true, value: null });
        }
        return;
      }

      if (event.key === "Escape" && !el.matchModal.classList.contains("hidden")) {
        closeMatchModal();
      }
    });

    bindDialogEvents();

    window.addEventListener("resize", syncNowLine);
    el.tableWrap.addEventListener("scroll", syncNowLine);
  }

  function renderAll() {
    renderMeta();
    renderClubs();
    renderSchedule();
    renderStats();
    renderModalClubNames();
  }

  function renderMeta() {
    el.matchNameInput.value = state.matchName;
    el.matchDateInput.value = state.matchDate;
    el.matchLocationInput.value = state.matchLocation;

    el.timeStartInput.value = state.timeConfig.start;
    el.timeEndInput.value = state.timeConfig.end;
    el.slotMinutesInput.value = String(state.timeConfig.interval);

    renderSaveStatus();
  }

  function bindDialogEvents() {
    if (
      !el.appDialog ||
      !el.appDialogCloseBtn ||
      !el.appDialogCancelBtn ||
      !el.appDialogConfirmBtn ||
      !el.appDialogInput
    ) {
      return;
    }
    if (el.appDialog.dataset.bound === "true") {
      return;
    }

    el.appDialogCloseBtn.addEventListener("click", () => {
      resolveActiveDialog({ confirmed: false, dismissed: true, value: null });
    });
    el.appDialogCancelBtn.addEventListener("click", () => {
      resolveActiveDialog({ confirmed: false, dismissed: false, value: null });
    });
    el.appDialogConfirmBtn.addEventListener("click", confirmActiveDialog);
    el.appDialog.addEventListener("click", (event) => {
      if (event.target === el.appDialog) {
        resolveActiveDialog({ confirmed: false, dismissed: true, value: null });
      }
    });
    el.appDialogInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmActiveDialog();
      }
    });

    el.appDialog.dataset.bound = "true";
  }

  function hasDialogUi() {
    return !!(
      el.appDialog &&
      el.appDialogTitle &&
      el.appDialogMessage &&
      el.appDialogInputWrap &&
      el.appDialogInputLabel &&
      el.appDialogInput &&
      el.appDialogCloseBtn &&
      el.appDialogCancelBtn &&
      el.appDialogConfirmBtn
    );
  }

  function confirmActiveDialog() {
    if (!activeDialogJob) {
      return;
    }

    const mode = activeDialogJob.config.mode;
    const value = mode === "prompt" ? String(el.appDialogInput?.value || "") : null;
    resolveActiveDialog({ confirmed: true, dismissed: false, value });
  }

  function resolveActiveDialog(result) {
    if (!activeDialogJob) {
      return;
    }

    const resolver = activeDialogJob.resolve;
    activeDialogJob = null;

    if (el.appDialog) {
      el.appDialog.classList.add("hidden");
      el.appDialog.setAttribute("aria-hidden", "true");
    }

    resolver(result);
    openNextDialog();
  }

  function openNextDialog() {
    if (activeDialogJob || dialogQueue.length === 0) {
      return;
    }

    activeDialogJob = dialogQueue.shift();
    const config = activeDialogJob.config;
    if (!hasDialogUi()) {
      if (config.mode === "alert") {
        window.alert(config.message);
        resolveActiveDialog({ confirmed: true, dismissed: false, value: null });
        return;
      }
      if (config.mode === "prompt") {
        const value = window.prompt(config.message, config.defaultValue || "");
        resolveActiveDialog({ confirmed: value !== null, dismissed: false, value });
        return;
      }
      const ok = window.confirm(config.message);
      resolveActiveDialog({ confirmed: ok, dismissed: false, value: null });
      return;
    }

    el.appDialogTitle.textContent = config.title;
    el.appDialogMessage.textContent = config.message;
    el.appDialogCancelBtn.textContent = config.cancelText;
    el.appDialogConfirmBtn.textContent = config.confirmText;

    if (config.confirmTone === "danger") {
      el.appDialogConfirmBtn.classList.add("btn-danger");
      el.appDialogConfirmBtn.classList.remove("btn-primary");
      el.appDialog.dataset.tone = "danger";
    } else {
      el.appDialogConfirmBtn.classList.add("btn-primary");
      el.appDialogConfirmBtn.classList.remove("btn-danger");
      el.appDialog.dataset.tone = "primary";
    }

    if (config.mode === "alert") {
      el.appDialogCancelBtn.classList.add("hidden");
      el.appDialogCloseBtn.classList.add("hidden");
    } else {
      el.appDialogCancelBtn.classList.remove("hidden");
      el.appDialogCloseBtn.classList.remove("hidden");
    }

    if (config.mode === "prompt") {
      el.appDialogInputWrap.classList.remove("hidden");
      el.appDialogInputLabel.textContent = config.inputLabel;
      el.appDialogInput.type = config.inputType;
      el.appDialogInput.placeholder = config.placeholder || "";
      el.appDialogInput.value = config.defaultValue || "";
    } else {
      el.appDialogInputWrap.classList.add("hidden");
      el.appDialogInput.value = "";
    }

    el.appDialog.classList.remove("hidden");
    el.appDialog.setAttribute("aria-hidden", "false");

    if (config.mode === "prompt") {
      window.setTimeout(() => {
        el.appDialogInput.focus();
        el.appDialogInput.select();
      }, 0);
      return;
    }

    window.setTimeout(() => {
      el.appDialogConfirmBtn.focus();
    }, 0);
  }

  function openDialog(config) {
    return new Promise((resolve) => {
      dialogQueue.push({ config, resolve });
      openNextDialog();
    });
  }

  async function appAlert(message, options = {}) {
    const title = String(options.title || "알림");
    const confirmText = String(options.confirmText || "확인");
    await openDialog({
      mode: "alert",
      title,
      message: String(message || ""),
      confirmText,
      cancelText: "",
      confirmTone: options.confirmTone === "danger" ? "danger" : "primary",
      inputLabel: "",
      inputType: "text",
      placeholder: "",
      defaultValue: "",
    });
  }

  async function appConfirm(message, options = {}) {
    const title = String(options.title || "확인");
    const confirmText = String(options.confirmText || "확인");
    const cancelText = String(options.cancelText || "취소");
    const result = await openDialog({
      mode: "confirm",
      title,
      message: String(message || ""),
      confirmText,
      cancelText,
      confirmTone: options.confirmTone === "danger" ? "danger" : "primary",
      inputLabel: "",
      inputType: "text",
      placeholder: "",
      defaultValue: "",
    });
    return !!result.confirmed;
  }

  async function appPrompt(message, options = {}) {
    const title = String(options.title || "입력");
    const confirmText = String(options.confirmText || "확인");
    const cancelText = String(options.cancelText || "취소");
    const result = await openDialog({
      mode: "prompt",
      title,
      message: String(message || ""),
      confirmText,
      cancelText,
      confirmTone: options.confirmTone === "danger" ? "danger" : "primary",
      inputLabel: String(options.inputLabel || "입력"),
      inputType: String(options.inputType || "text"),
      placeholder: String(options.placeholder || ""),
      defaultValue: String(options.defaultValue || ""),
    });

    if (!result.confirmed) {
      return null;
    }
    return String(result.value || "");
  }

  function normalizeSyncConfig(input) {
    const source = isObject(input) ? input : {};
    const url = String(source.url || "").trim();
    const anonKey = String(source.anonKey || "").trim();
    return {
      url: url || DEFAULT_SUPABASE_URL,
      anonKey: anonKey || DEFAULT_SUPABASE_ANON_KEY,
      matchId: sanitizeMatchId(source.matchId || source.roomId),
      writePassword: String(source.writePassword || "").trim(),
      autoConnect: source.autoConnect !== false,
    };
  }

  function sanitizeMatchId(value) {
    const roomRaw = String(value || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    return roomRaw || DEFAULT_SYNC_MATCH_ID;
  }

  function loadSyncConfig() {
    try {
      const raw = window.localStorage.getItem(SYNC_CONFIG_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function saveSyncConfig(config) {
    syncConfig = normalizeSyncConfig(config);
    window.localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
  }

  function renderSyncConfigInputs() {
    if (!el.supabaseUrlInput || !el.supabaseAnonKeyInput || !el.syncMatchIdInput || !el.syncWritePasswordInput) {
      return;
    }

    el.supabaseUrlInput.value = syncConfig.url;
    el.supabaseAnonKeyInput.value = syncConfig.anonKey;
    el.syncMatchIdInput.value = syncConfig.matchId;
    el.syncWritePasswordInput.value = syncConfig.writePassword;
  }

  function readSyncConfigFromInputs() {
    return normalizeSyncConfig({
      url: String(el.supabaseUrlInput?.value || ""),
      anonKey: String(el.supabaseAnonKeyInput?.value || ""),
      matchId: String(el.syncMatchIdInput?.value || ""),
      writePassword: String(el.syncWritePasswordInput?.value || ""),
      autoConnect: true,
    });
  }

  function hasSyncCredentials(config) {
    return !!(config.url && config.anonKey && config.matchId);
  }

  function isSyncWriteProtected() {
    return !!syncConfig.writePassword;
  }

  async function requestCloudSaveApproval() {
    if (!syncConnected || !syncClient) {
      return false;
    }
    if (!isSyncWriteProtected()) {
      renderSyncStatus("저장 비밀번호가 비어 있어 로컬 저장만 적용됩니다.");
      return false;
    }

    const entered = await appPrompt("클라우드 저장 비밀번호를 입력하세요.", {
      title: "비밀번호 확인",
      inputLabel: "저장 비밀번호",
      inputType: "password",
      confirmText: "확인",
      cancelText: "취소",
    });
    if (entered === null) {
      renderSyncStatus("비밀번호 입력이 취소되어 로컬 저장만 적용됩니다.");
      return false;
    }

    if (String(entered) !== syncConfig.writePassword) {
      renderSyncStatus("비밀번호가 올바르지 않아 클라우드 저장이 차단되었습니다.", { error: true });
      return false;
    }

    return true;
  }

  function renderSyncStatus(message, { error = false } = {}) {
    if (!el.syncStatus) {
      return;
    }
    el.syncStatus.textContent = message;
    el.syncStatus.style.color = error ? "#b13650" : "#4e6257";
  }

  function setSyncButtonsState(connecting) {
    if (!el.connectSyncBtn || !el.disconnectSyncBtn) {
      return;
    }

    if (connecting) {
      el.connectSyncBtn.textContent = "연결 중...";
    } else {
      el.connectSyncBtn.textContent = syncConnected ? "재동기화" : "동기화 연결";
    }

    el.connectSyncBtn.disabled = !!connecting;
    el.disconnectSyncBtn.disabled = !!connecting || !syncConnected;
  }

  function attemptAutoConnectSync() {
    if (!syncConfig.autoConnect || !hasSyncCredentials(syncConfig)) {
      return;
    }
    connectSupabaseSync({ silent: true });
  }

  async function connectSupabaseSync({ silent = false } = {}) {
    const nextConfig = readSyncConfigFromInputs();
    saveSyncConfig(nextConfig);
    renderSyncConfigInputs();

    if (!hasSyncCredentials(syncConfig)) {
      renderSyncStatus("Project URL, Anon Key, Match ID를 모두 입력해 주세요.", { error: true });
      return;
    }

    const createClient = window.supabase?.createClient;
    if (typeof createClient !== "function") {
      renderSyncStatus("Supabase SDK 로드 실패. 새로고침 후 다시 시도해 주세요.", { error: true });
      return;
    }

    setSyncButtonsState(true);
    renderSyncStatus("클라우드 동기화 연결 중...");

    await disconnectSupabaseSync({ keepStatus: true, keepConfig: true });

    try {
      syncClient = createClient(syncConfig.url, syncConfig.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      syncConnected = true;

      const remoteRow = await fetchRemoteSyncRow();
      if (remoteRow?.payload) {
        // 연결 즉시 원격 데이터를 우선 반영해 새로고침 없이 같은 화면을 보게 합니다.
        applyRemoteState(remoteRow.payload, { source: "초기 동기화" });
      } else {
        if (isSyncWriteProtected()) {
          renderSyncStatus(
            `클라우드 동기화 연결됨 (Match ID: ${syncConfig.matchId}) · 원격 데이터 없음, 저장 버튼 비밀번호 인증 후 업로드`,
            { error: false }
          );
        } else {
          renderSyncStatus(
            `클라우드 동기화 연결됨 (Match ID: ${syncConfig.matchId}) · 비밀번호 미설정(읽기 전용, 로컬 저장만)`,
            { error: false }
          );
        }
      }

      subscribeSyncChannel();
      renderSyncStatus(
        isSyncWriteProtected()
          ? `클라우드 동기화 연결됨 (Match ID: ${syncConfig.matchId}) · 저장 시 비밀번호 필요`
          : `클라우드 동기화 연결됨 (Match ID: ${syncConfig.matchId}) · 비밀번호 미설정(읽기 전용, 로컬 저장만)`
      );
    } catch (error) {
      syncConnected = false;
      syncClient = null;
      renderSyncStatus(`동기화 연결 실패: ${formatErrorMessage(error)}`, { error: true });
      if (!silent) {
        window.console.error(error);
      }
    } finally {
      setSyncButtonsState(false);
    }
  }

  async function disconnectSupabaseSync({ keepStatus = false, keepConfig = false } = {}) {
    if (syncPushTimer) {
      window.clearTimeout(syncPushTimer);
      syncPushTimer = null;
    }
    syncPushInFlight = false;
    syncPushQueued = false;

    if (syncChannel && typeof syncChannel.unsubscribe === "function") {
      try {
        await syncChannel.unsubscribe();
      } catch (error) {
        window.console.warn(error);
      }
    }
    syncChannel = null;

    if (syncClient && typeof syncClient.removeAllChannels === "function") {
      try {
        syncClient.removeAllChannels();
      } catch (error) {
        window.console.warn(error);
      }
    }
    syncClient = null;
    syncConnected = false;

    if (!keepConfig) {
      saveSyncConfig({ ...syncConfig, autoConnect: false });
    }

    if (!keepStatus) {
      renderSyncStatus("클라우드 동기화 꺼짐");
    }
    setSyncButtonsState(false);
  }

  async function fetchRemoteSyncRow() {
    if (!syncClient) {
      return null;
    }

    const { data, error } = await syncClient
      .from(SYNC_TABLE)
      .select("room_id,payload,updated_at,updated_by")
      .eq("room_id", syncConfig.matchId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  function shouldApplyRemoteState(remotePayload, remoteUpdatedAt) {
    const remoteState = normalizeState(remotePayload);
    if (hasMeaningfulState(remoteState) && !hasMeaningfulState(state)) {
      return true;
    }
    const remoteMs = toTimestampMs(remoteUpdatedAt || remoteState.updatedAt);
    const localMs = toTimestampMs(state.updatedAt);

    if (remoteMs === null) {
      return true;
    }
    if (localMs === null) {
      return true;
    }
    return remoteMs >= localMs;
  }

  function hasMeaningfulState(targetState) {
    const nextState = normalizeState(targetState);

    if (String(nextState.matchName || "").trim()) {
      return true;
    }
    if (String(nextState.matchDate || "").trim()) {
      return true;
    }
    if (String(nextState.matchLocation || "").trim()) {
      return true;
    }
    if (Object.keys(nextState.matches || {}).length > 0) {
      return true;
    }

    return nextState.clubs.some((club) => Array.isArray(club.players) && club.players.length > 0);
  }

  function applyRemoteState(remotePayload, { source = "원격 변경" } = {}) {
    syncPullInProgress = true;
    state = normalizeState(remotePayload);
    editingPlayer = null;
    playerSortState = [defaultPlayerSort(), defaultPlayerSort()];
    renderAll();
    saveState(false);
    syncPullInProgress = false;
    renderSyncStatus(`클라우드 변경 반영됨 (${source})`);
  }

  function subscribeSyncChannel() {
    if (!syncClient) {
      return;
    }

    syncChannel = syncClient
      .channel(`sync-match-${syncConfig.matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SYNC_TABLE,
          filter: `room_id=eq.${syncConfig.matchId}`,
        },
        (payload) => {
          const nextRow = payload.new;
          if (!isObject(nextRow) || !isObject(nextRow.payload)) {
            return;
          }
          if (nextRow.updated_by === syncClientId) {
            return;
          }
          if (!shouldApplyRemoteState(nextRow.payload, nextRow.updated_at)) {
            return;
          }
          applyRemoteState(nextRow.payload, { source: "실시간" });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          renderSyncStatus(`클라우드 동기화 연결됨 (Match ID: ${syncConfig.matchId})`);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          renderSyncStatus(`실시간 동기화 채널 오류 (${status})`, { error: true });
        }
      });
  }

  function queueSyncPush({ immediate = false } = {}) {
    if (!syncConnected || !syncClient || syncPullInProgress) {
      return;
    }

    if (immediate) {
      pushStateToCloud({ immediate: true });
      return;
    }

    window.clearTimeout(syncPushTimer);
    syncPushTimer = window.setTimeout(() => {
      pushStateToCloud({ immediate: false });
    }, 700);
  }

  async function pushStateToCloud({ immediate = false } = {}) {
    if (!syncConnected || !syncClient || syncPullInProgress) {
      return;
    }

    if (syncPushInFlight) {
      syncPushQueued = true;
      return;
    }

    syncPushInFlight = true;
    window.clearTimeout(syncPushTimer);
    syncPushTimer = null;

    try {
      const row = {
        room_id: syncConfig.matchId,
        payload: state,
        updated_by: syncClientId,
        updated_at: new Date().toISOString(),
      };

      const { error } = await syncClient.from(SYNC_TABLE).upsert(row, { onConflict: "room_id" });
      if (error) {
        throw error;
      }

      if (immediate) {
        renderSyncStatus(`클라우드 저장 완료 (${formatClockTime(new Date())})`);
      }
    } catch (error) {
      renderSyncStatus(`클라우드 저장 실패: ${formatErrorMessage(error)}`, { error: true });
    } finally {
      syncPushInFlight = false;
      if (syncPushQueued) {
        syncPushQueued = false;
        queueSyncPush({ immediate: false });
      }
    }
  }

  function toTimestampMs(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return null;
    }
    return date.getTime();
  }

  function formatClockTime(date) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatErrorMessage(error) {
    if (!error) {
      return "알 수 없는 오류";
    }
    if (typeof error.message === "string" && error.message) {
      return error.message;
    }
    return String(error);
  }

  function renderClubs() {
    const html = state.clubs
      .map((club, clubIndex) => {
        const maleCount = club.players.filter((player) => player.gender === "M").length;
        const femaleCount = club.players.filter((player) => player.gender === "F").length;
        const totalCount = club.players.length;

        const groupedPlayers = groupPlayersByGenderSorted(club.players);
        const rightSidePlayers = [...groupedPlayers.female, ...groupedPlayers.unknown];

        const maleCards = groupedPlayers.male
          .map((player) => renderClubPlayerCardHtml(player, clubIndex))
          .join("");
        const femaleCards = rightSidePlayers
          .map((player) => renderClubPlayerCardHtml(player, clubIndex))
          .join("");

        const playerCards = totalCount
          ? `
              <div class="club-player-columns">
                ${renderGenderColumnHtml({
                  columnClass: "gender-m",
                  icon: "♂",
                  cardsHtml: maleCards,
                })}
                ${renderGenderColumnHtml({
                  columnClass: "gender-f",
                  icon: "♀",
                  cardsHtml: femaleCards,
                })}
              </div>
            `
          : `<div class="empty-note">등록된 선수가 없습니다.</div>`;

        return `
          <article class="club-card">
            <div class="club-card-head">
              <h3>클럽 ${clubIndex + 1}</h3>
              <input
                class="club-name-input"
                data-club-index="${clubIndex}"
                value="${escapeAttr(club.name)}"
                placeholder="클럽 이름"
              />
            </div>

            <div class="club-counts">
              <span class="count-pill male">남 ${maleCount}명</span>
              <span class="count-pill female">여 ${femaleCount}명</span>
              <span class="count-pill total">총 ${totalCount}명</span>
            </div>

            <form class="player-form" data-club-index="${clubIndex}">
              <div class="player-form-grid">
                <label class="field compact">
                  <span>이름 *</span>
                  <input name="name" type="text" required placeholder="예: 민수,태훈,준호" />
                </label>

                <label class="field compact">
                  <span>성별 *</span>
                  ${renderGenderToggleHtml({
                    gender: "M",
                    className: "add-gender-toggle",
                    attrs: `data-club-index="${clubIndex}"`,
                    maleLabel: "♂",
                    femaleLabel: "♀",
                    withHiddenInput: true,
                  })}
                </label>
              </div>

              <div class="player-actions">
                <button class="btn btn-primary add-player-btn" type="submit" aria-label="선수 추가">👤+</button>
              </div>
            </form>

            <div class="club-player-box ${totalCount ? "" : "empty"}">${playerCards}</div>
          </article>
        `;
      })
      .join("");

    el.clubsContainer.innerHTML = html;
    focusEditingPlayerInput();
  }

  function renderClubPlayerCardHtml(player, clubIndex) {
    const isEditingName =
      editingPlayer &&
      editingPlayer.clubIndex === clubIndex &&
      editingPlayer.playerId === player.id;

    return `
      <div class="club-player-card ${genderClassName(player.gender)}">
        <div class="player-name-editor">
          ${
            isEditingName
              ? `
                <input
                  class="inline-input player-name-edit-input"
                  data-club-index="${clubIndex}"
                  data-player-id="${escapeAttr(player.id)}"
                  value="${escapeAttr(player.name)}"
                  placeholder="이름"
                />
              `
              : `
                <button
                  class="player-name-display"
                  type="button"
                  data-club-index="${clubIndex}"
                  data-player-id="${escapeAttr(player.id)}"
                  title="클릭: 성별 변경 · 더블클릭: 이름 수정"
                >
                  ${escapeHtml(player.name || "이름없음")}
                </button>
              `
          }
          <button
            class="icon-danger remove-player-btn club-player-remove"
            type="button"
            data-club-index="${clubIndex}"
            data-player-id="${escapeAttr(player.id)}"
            aria-label="선수 삭제"
          >
            ×
          </button>
        </div>
      </div>
    `;
  }

  function renderGenderColumnHtml({ columnClass, icon, cardsHtml }) {
    return `
      <div class="player-list-column ${escapeAttr(columnClass)}">
        <div class="player-list-head" aria-hidden="true">
          <span class="player-list-gender-icon">${escapeHtml(icon)}</span>
        </div>
        <div class="player-list-stack ${cardsHtml ? "" : "empty"}">
          ${cardsHtml || `<span class="player-list-empty">없음</span>`}
        </div>
      </div>
    `;
  }

  function comparePlayerNameAsc(left, right) {
    const leftName = String(left?.name || "").trim();
    const rightName = String(right?.name || "").trim();
    const byName = leftName.localeCompare(rightName, "ko-KR", {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) {
      return byName;
    }

    const leftId = String(left?.id || "");
    const rightId = String(right?.id || "");
    return leftId.localeCompare(rightId);
  }

  function sortPlayersByName(players) {
    return [...players].sort(comparePlayerNameAsc);
  }

  function groupPlayersByGenderSorted(players) {
    const male = [];
    const female = [];
    const unknown = [];

    players.forEach((player) => {
      if (player.gender === "M") {
        male.push(player);
        return;
      }
      if (player.gender === "F") {
        female.push(player);
        return;
      }
      unknown.push(player);
    });

    return {
      male: sortPlayersByName(male),
      female: sortPlayersByName(female),
      unknown: sortPlayersByName(unknown),
    };
  }

  function renderGenderToggleHtml({
    gender,
    className = "",
    attrs = "",
    maleLabel = "남",
    femaleLabel = "여",
    withHiddenInput = false,
  }) {
    const current = gender === "F" ? "F" : "M";

    return `
      <div class="gender-toggle ${escapeAttr(className)}" ${attrs}>
        <button type="button" class="gender-btn ${current === "M" ? "active" : ""}" data-gender-value="M">${escapeHtml(
      maleLabel
    )}</button>
        <button type="button" class="gender-btn ${current === "F" ? "active" : ""}" data-gender-value="F">${escapeHtml(
      femaleLabel
    )}</button>
        ${withHiddenInput ? `<input type="hidden" name="gender" value="${current}" />` : ""}
      </div>
    `;
  }

  function setToggleActive(toggle, gender) {
    const nextGender = gender === "F" ? "F" : "M";
    const buttons = toggle.querySelectorAll(".gender-btn");
    buttons.forEach((button) => {
      button.classList.toggle("active", button.dataset.genderValue === nextGender);
    });
  }

  function defaultPlayerSort() {
    return { key: "wins", dir: "desc" };
  }

  function isValidPlayerSortKey(key) {
    return ["name", "played", "wins", "losses", "winRate"].includes(key);
  }

  function updatePlayerSort(clubIndex, key) {
    const current = playerSortState[clubIndex] || defaultPlayerSort();
    const defaultDir = key === "name" ? "asc" : "desc";
    const nextDir = current.key === key ? (current.dir === "asc" ? "desc" : "asc") : defaultDir;
    playerSortState[clubIndex] = { key, dir: nextDir };
  }

  function renderPlayerSortHeader(clubIndex, key, label, sortState) {
    const active = sortState.key === key;
    const arrow = active ? (sortState.dir === "asc" ? "↑" : "↓") : "↕";
    return `
      <button
        class="stats-sort-btn ${active ? "active" : ""}"
        type="button"
        data-club-index="${clubIndex}"
        data-sort-key="${key}"
      >
        ${escapeHtml(label)} <span class="stats-sort-arrow">${arrow}</span>
      </button>
    `;
  }

  function comparePlayersBySort(a, b, sortState) {
    const { key, dir } = sortState || defaultPlayerSort();
    const sign = dir === "asc" ? 1 : -1;

    let result = 0;
    if (key === "name") {
      result = String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
    } else {
      const avRaw = Number(a[key]);
      const bvRaw = Number(b[key]);
      const av = Number.isFinite(avRaw) ? avRaw : 0;
      const bv = Number.isFinite(bvRaw) ? bvRaw : 0;
      result = av - bv;
    }

    if (result === 0) {
      result = Number(a.wins) - Number(b.wins);
    }
    if (result === 0) {
      result = String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
    }
    if (result === 0) {
      result = String(a.id || "").localeCompare(String(b.id || ""));
    }

    return result * sign;
  }

  function parseBulkPlayerNames(rawNames) {
    return String(rawNames || "")
      .split(/[,，\n]/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function focusEditingPlayerInput() {
    if (!editingPlayer) {
      return;
    }

    const selector = `.player-name-edit-input[data-club-index="${editingPlayer.clubIndex}"][data-player-id="${editingPlayer.playerId}"]`;
    const input = el.clubsContainer.querySelector(selector);
    if (!input) {
      editingPlayer = null;
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function commitPlayerNameEdit(input, { saveIfBlank = false } = {}) {
    if (!input) {
      return;
    }

    const clubIndex = Number(input.dataset.clubIndex);
    const playerId = String(input.dataset.playerId || "");
    const player = findPlayerById(clubIndex, playerId);
    if (!player) {
      editingPlayer = null;
      renderClubs();
      return;
    }

    const nextName = String(input.value || "").trim();
    const prevName = String(player.name || "");

    if (!nextName && !saveIfBlank) {
      editingPlayer = null;
      renderClubs();
      return;
    }

    editingPlayer = null;

    if (nextName && nextName !== prevName) {
      player.name = nextName;
      renderClubs();
      renderSchedule();
      renderStats();
      refreshModalIfOpen();
      saveState(false);
      return;
    }

    renderClubs();
  }

  function cancelPlayerNameEdit() {
    if (!editingPlayer) {
      return;
    }
    editingPlayer = null;
    renderClubs();
  }

  function clearPendingNameToggle() {
    if (pendingNameToggleTimer) {
      window.clearTimeout(pendingNameToggleTimer);
      pendingNameToggleTimer = null;
    }
  }

  function togglePlayerGender(clubIndex, playerId) {
    const player = findPlayerById(clubIndex, playerId);
    if (!player) {
      return;
    }

    const nextGender = player.gender === "F" ? "M" : "F";
    updatePlayerGender(clubIndex, playerId, nextGender);
  }

  function updatePlayerGender(clubIndex, playerId, nextGender) {
    if (!Number.isInteger(clubIndex) || !playerId) {
      return;
    }
    if (nextGender !== "M" && nextGender !== "F") {
      return;
    }

    const player = findPlayerById(clubIndex, playerId);
    if (!player || player.gender === nextGender) {
      return;
    }

    player.gender = nextGender;
    renderClubs();
    renderSchedule();
    renderStats();
    refreshModalIfOpen();
    saveState(false);
  }

  function handleScheduleDragStart(event) {
    const slotBtn = event.target.closest(".slot-btn.filled");
    if (!slotBtn) {
      return;
    }

    const slotKey = String(slotBtn.dataset.slotKey || "");
    if (!slotKey || !state.matches[slotKey]) {
      return;
    }

    draggingSlotKey = slotKey;
    slotBtn.classList.add("dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", slotKey);
    }
  }

  function handleScheduleDragOver(event) {
    if (!draggingSlotKey) {
      return;
    }

    const slotBtn = event.target.closest(".slot-btn");
    if (!slotBtn) {
      return;
    }

    const targetSlotKey = String(slotBtn.dataset.slotKey || "");
    if (!targetSlotKey || targetSlotKey === draggingSlotKey) {
      clearScheduleDropTargets();
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    clearScheduleDropTargets(slotBtn);
    slotBtn.classList.add("drop-target");
  }

  function handleScheduleDragLeave(event) {
    if (!draggingSlotKey) {
      return;
    }

    const slotBtn = event.target.closest(".slot-btn.drop-target");
    if (!slotBtn) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget && slotBtn.contains(nextTarget)) {
      return;
    }

    slotBtn.classList.remove("drop-target");
  }

  function handleScheduleDrop(event) {
    if (!draggingSlotKey) {
      return;
    }

    const slotBtn = event.target.closest(".slot-btn");
    if (!slotBtn) {
      return;
    }

    const targetSlotKey = String(slotBtn.dataset.slotKey || "");
    if (!targetSlotKey) {
      return;
    }

    event.preventDefault();
    clearScheduleDropTargets();

    if (targetSlotKey === draggingSlotKey) {
      return;
    }

    moveOrSwapMatchSlot(draggingSlotKey, targetSlotKey);
    suppressSlotClickUntil = Date.now() + 260;
  }

  function handleScheduleDragEnd() {
    clearScheduleDropTargets();

    const draggingBtn = el.scheduleTable.querySelector(".slot-btn.dragging");
    if (draggingBtn) {
      draggingBtn.classList.remove("dragging");
    }

    draggingSlotKey = "";
  }

  function clearScheduleDropTargets(keepButton = null) {
    const targets = el.scheduleTable.querySelectorAll(".slot-btn.drop-target");
    targets.forEach((button) => {
      if (keepButton && button === keepButton) {
        return;
      }
      button.classList.remove("drop-target");
    });
  }

  function moveOrSwapMatchSlot(sourceSlotKey, targetSlotKey) {
    if (!sourceSlotKey || !targetSlotKey || sourceSlotKey === targetSlotKey) {
      return;
    }

    const sourceMatch = state.matches[sourceSlotKey];
    if (!sourceMatch) {
      return;
    }

    const targetMatch = state.matches[targetSlotKey];
    if (targetMatch) {
      state.matches[targetSlotKey] = sourceMatch;
      state.matches[sourceSlotKey] = targetMatch;
    } else {
      state.matches[targetSlotKey] = sourceMatch;
      delete state.matches[sourceSlotKey];
    }

    renderSchedule();
    renderStats();
    saveState(false);
  }

  function renderSchedule() {
    const canDeleteCourt = state.courts.length > 1;

    const headHtml = state.courts
      .map(
        (court, courtIndex) => `
          <th>
            <div class="court-head">
              <div>
                <strong>코트 ${courtIndex + 1}</strong>
                <small>${escapeHtml(court.name || "")}</small>
              </div>
              ${
                canDeleteCourt
                  ? `<button class="court-remove-btn" type="button" data-court-id="${escapeAttr(
                      court.id
                    )}" aria-label="코트 삭제">×</button>`
                  : ""
              }
            </div>
          </th>
        `
      )
      .join("");

    const bodyHtml = state.times
      .map((timeLabel, timeIndex) => {
        const cells = state.courts
          .map((court) => {
            const slotKey = makeSlotKey(timeIndex, court.id);
            const match = state.matches[slotKey];

            if (!match) {
              return `
                <td>
                  <button class="slot-btn empty" type="button" data-slot-key="${escapeAttr(slotKey)}">
                    + 경기 추가
                  </button>
                </td>
              `;
            }

            const type = getMatchType(match);
            const clubAName = state.clubs[0].name || "클럽 1";
            const clubBName = state.clubs[1].name || "클럽 2";
            const pairAHtml = renderPairPlayersHtml(0, match.clubAPlayerIds);
            const pairBHtml = renderPairPlayersHtml(1, match.clubBPlayerIds);

            const scoreHtml = isCompletedScore(match)
              ? `<span class="slot-score">${escapeHtml(String(toSafeNumber(match.scoreA)))} : ${escapeHtml(
                  String(toSafeNumber(match.scoreB))
                )}</span>`
              : `<span class="slot-score pending">결과 미입력</span>`;

            return `
              <td>
                <button
                  class="slot-btn filled type-${type.code}"
                  type="button"
                  data-slot-key="${escapeAttr(slotKey)}"
                  draggable="true"
                  title="드래그로 경기 이동"
                >
                  <div class="slot-inner">
                    <div class="slot-side">
                      <span class="slot-club">${escapeHtml(clubAName)}</span>
                      <div class="slot-pair">${pairAHtml}</div>
                    </div>
                    <div class="slot-vs">
                      <span class="vs-icon">⚔</span>
                      ${scoreHtml}
                    </div>
                    <div class="slot-side align-right">
                      <span class="slot-club">${escapeHtml(clubBName)}</span>
                      <div class="slot-pair">${pairBHtml}</div>
                    </div>
                  </div>
                </button>
              </td>
            `;
          })
          .join("");

        return `
          <tr data-time-index="${timeIndex}">
            <th class="time-cell time-col">${escapeHtml(timeLabel)}</th>
            ${cells}
          </tr>
        `;
      })
      .join("");

    el.scheduleTable.innerHTML = `
      <thead>
        <tr>
          <th class="time-col">시간</th>
          ${headHtml}
        </tr>
      </thead>
      <tbody>
        ${bodyHtml}
      </tbody>
    `;

    syncNowLine();
  }

  function renderStats() {
    const stats = computeStats();
    renderTrendGraph(stats.trendSeries);

    const clubCards = state.clubs
      .map((club, index) => {
        const item = stats.clubStats[index];
        return `
          <article class="stat-card">
            <h3>${escapeHtml(club.name || `클럽 ${index + 1}`)}</h3>
            <p>전적: <strong>${item.wins}승 ${item.losses}패 ${item.draws}무</strong> (${item.played}경기)</p>
            <p>게임 득실: <strong>${item.gamesFor}</strong> / <strong>${item.gamesAgainst}</strong> (득실차 ${item.diff})</p>
          </article>
        `;
      })
      .join("");

    el.clubStats.innerHTML = clubCards;

    if (stats.topPlayers.length === 0) {
      el.topWinnerBox.innerHTML = "최다승: 아직 결과 입력된 경기가 없습니다.";
    } else {
      const topHtml = stats.topPlayers
        .map((item) => `<span>${renderPlayerLabelHtml(item.name, item.gender)} ${item.wins}승</span>`)
        .join(" ");

      el.topWinnerBox.innerHTML = `최다승: <span class="top-player-list">${topHtml}</span>`;
    }

    const playerCards = state.clubs
      .map((club, clubIndex) => {
        const sortState = playerSortState[clubIndex] || defaultPlayerSort();
        const sortedPlayers = stats.players
          .filter((item) => item.clubIndex === clubIndex)
          .sort((a, b) => comparePlayersBySort(a, b, sortState));

        const rows = sortedPlayers
          .map(
            (item) => `
            <tr>
              <td>${renderPlayerLabelHtml(item.name, item.gender)}</td>
              <td>${item.played}</td>
              <td>${item.wins}</td>
              <td>${item.losses}</td>
              <td>${item.winRate.toFixed(1)}%</td>
            </tr>
          `
          )
          .join("");

        return `
          <article class="player-stats-card">
            <h4>${escapeHtml(club.name || `클럽 ${clubIndex + 1}`)} 선수 승률</h4>
            <table class="player-stats-table">
              <thead>
                <tr>
                  <th>${renderPlayerSortHeader(clubIndex, "name", "선수", sortState)}</th>
                  <th>${renderPlayerSortHeader(clubIndex, "played", "경기", sortState)}</th>
                  <th>${renderPlayerSortHeader(clubIndex, "wins", "승", sortState)}</th>
                  <th>${renderPlayerSortHeader(clubIndex, "losses", "패", sortState)}</th>
                  <th>${renderPlayerSortHeader(clubIndex, "winRate", "승률", sortState)}</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="5">결과가 입력된 경기가 없습니다.</td></tr>`}
              </tbody>
            </table>
          </article>
        `;
      })
      .join("");

    el.playerStats.innerHTML = playerCards;
  }

  function renderModalClubNames() {
    const clubAName = state.clubs[0]?.name || "클럽 1";
    const clubBName = state.clubs[1]?.name || "클럽 2";

    el.clubAName.textContent = clubAName;
    el.clubBName.textContent = clubBName;
    el.scoreLabelA.textContent = `${clubAName} 점수`;
    el.scoreLabelB.textContent = `${clubBName} 점수`;
  }

  function openMatchModal(slotKey) {
    const parsed = parseSlotKey(slotKey);
    if (!parsed) {
      return;
    }

    const { timeIndex, courtId } = parsed;
    const courtIndex = state.courts.findIndex((court) => court.id === courtId);
    if (courtIndex < 0) {
      return;
    }

    activeSlotKey = slotKey;
    const match = normalizeMatch(state.matches[slotKey] || emptyMatch());

    modalDraft = {
      clubASelected: compactPlayerIds(match.clubAPlayerIds),
      clubBSelected: compactPlayerIds(match.clubBPlayerIds),
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      memo: match.memo,
    };

    renderModalClubNames();

    const timeLabel = state.times[timeIndex] || "시간 미정";
    el.modalTitle.textContent = `${timeLabel} · 코트 ${courtIndex + 1}`;

    el.scoreAInput.value = modalDraft.scoreA;
    el.scoreBInput.value = modalDraft.scoreB;
    el.matchMemoInput.value = modalDraft.memo;

    el.deleteMatchBtn.style.visibility = state.matches[slotKey] ? "visible" : "hidden";

    renderModalPicker(0);
    renderModalPicker(1);
    updateMatchTypeBadgeFromModal();

    el.matchModal.classList.remove("hidden");
    el.matchModal.setAttribute("aria-hidden", "false");
  }

  function closeMatchModal() {
    activeSlotKey = null;
    modalDraft = null;
    el.matchModal.classList.add("hidden");
    el.matchModal.setAttribute("aria-hidden", "true");
  }

  function handleModalPickerClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    const clubIndex = Number(actionTarget.dataset.clubIndex);
    const playerId = actionTarget.dataset.playerId;

    if (!Number.isInteger(clubIndex) || !playerId) {
      return;
    }

    if (action === "pick-player") {
      addPlayerToModalSelection(clubIndex, playerId);
      return;
    }

    if (action === "remove-selected") {
      removePlayerFromModalSelection(clubIndex, playerId);
    }
  }

  function addPlayerToModalSelection(clubIndex, playerId) {
    if (!modalDraft) {
      return;
    }

    const list = getModalSelectedRef(clubIndex);
    if (!list) {
      return;
    }

    if (list.includes(playerId)) {
      return;
    }

    if (list.length >= 2) {
      list.shift();
    }
    list.push(playerId);

    renderModalPicker(clubIndex);
    updateMatchTypeBadgeFromModal();
  }

  function removePlayerFromModalSelection(clubIndex, playerId) {
    if (!modalDraft) {
      return;
    }

    const list = getModalSelectedRef(clubIndex);
    if (!list) {
      return;
    }

    const index = list.indexOf(playerId);
    if (index < 0) {
      return;
    }

    list.splice(index, 1);
    renderModalPicker(clubIndex);
    updateMatchTypeBadgeFromModal();
  }

  function getModalSelectedRef(clubIndex) {
    if (!modalDraft) {
      return null;
    }
    if (clubIndex === 0) {
      return modalDraft.clubASelected;
    }
    if (clubIndex === 1) {
      return modalDraft.clubBSelected;
    }
    return null;
  }

  function renderModalPicker(clubIndex) {
    if (!modalDraft) {
      return;
    }

    const selected = clubIndex === 0 ? modalDraft.clubASelected : modalDraft.clubBSelected;
    const selectedEl = clubIndex === 0 ? el.clubASelected : el.clubBSelected;
    const poolEl = clubIndex === 0 ? el.clubAPlayerPool : el.clubBPlayerPool;

    if (selected.length === 0) {
      selectedEl.classList.add("empty");
      selectedEl.innerHTML = "선수를 선택하세요 (최대 2명)";
    } else {
      selectedEl.classList.remove("empty");
      selectedEl.innerHTML = selected
        .map((playerId) => {
          const player = findPlayerById(clubIndex, playerId);
          const name = player?.name || "삭제된 선수";
          const gender = player?.gender || "";
          const className = genderClassName(gender);

          return `
            <div class="selected-chip ${className}">
              ${renderPlayerLabelHtml(name, gender)}
              <button
                class="selected-chip-x"
                type="button"
                data-action="remove-selected"
                data-club-index="${clubIndex}"
                data-player-id="${escapeAttr(playerId)}"
                aria-label="선수 제거"
              >
                ×
              </button>
            </div>
          `;
        })
        .join("");
    }

    const groupedPlayers = groupPlayersByGenderSorted(state.clubs[clubIndex].players);
    const rightSidePlayers = [...groupedPlayers.female, ...groupedPlayers.unknown];
    const hasAnyPlayer = groupedPlayers.male.length + rightSidePlayers.length > 0;

    if (!hasAnyPlayer) {
      poolEl.innerHTML = `<div class="empty-note">등록된 선수가 없습니다.</div>`;
      return;
    }

    poolEl.innerHTML = `
      <div class="player-pool-columns">
        ${renderPoolGenderColumnHtml({
          players: groupedPlayers.male,
          selected,
          clubIndex,
          columnClass: "gender-m",
          icon: "♂",
        })}
        ${renderPoolGenderColumnHtml({
          players: rightSidePlayers,
          selected,
          clubIndex,
          columnClass: "gender-f",
          icon: "♀",
        })}
      </div>
    `;
  }

  function renderPoolGenderColumnHtml({ players, selected, clubIndex, columnClass, icon }) {
    const buttonHtml = players
      .map((player) => {
        const isSelected = selected.includes(player.id);

        return `
          <button
            class="pool-player-btn ${isSelected ? "selected" : ""}"
            type="button"
            data-action="pick-player"
            data-club-index="${clubIndex}"
            data-player-id="${escapeAttr(player.id)}"
            ${isSelected ? "disabled" : ""}
          >
            ${renderPlayerLabelHtml(player.name || "이름없음", player.gender)}
          </button>
        `;
      })
      .join("");

    return `
      <div class="pool-column ${escapeAttr(columnClass)}">
        <div class="pool-column-head" aria-hidden="true">
          <span class="pool-column-icon">${escapeHtml(icon)}</span>
        </div>
        <div class="pool-column-list ${buttonHtml ? "" : "empty"}">
          ${buttonHtml || `<span class="pool-column-empty">없음</span>`}
        </div>
      </div>
    `;
  }

  async function saveMatchFromModal() {
    if (!activeSlotKey || !modalDraft) {
      return;
    }

    const clubASelected = compactPlayerIds(modalDraft.clubASelected);
    const clubBSelected = compactPlayerIds(modalDraft.clubBSelected);

    if (clubASelected.length < 2 || clubBSelected.length < 2) {
      await appAlert("각 클럽 선수 2명씩 선택해야 합니다.", { title: "입력 확인" });
      return;
    }

    if (clubASelected[0] === clubASelected[1]) {
      await appAlert("클럽 1 선수는 서로 달라야 합니다.", { title: "입력 확인" });
      return;
    }

    if (clubBSelected[0] === clubBSelected[1]) {
      await appAlert("클럽 2 선수는 서로 달라야 합니다.", { title: "입력 확인" });
      return;
    }

    state.matches[activeSlotKey] = normalizeMatch({
      clubAPlayerIds: [clubASelected[0], clubASelected[1]],
      clubBPlayerIds: [clubBSelected[0], clubBSelected[1]],
      scoreA: el.scoreAInput.value.trim(),
      scoreB: el.scoreBInput.value.trim(),
      memo: el.matchMemoInput.value.trim(),
    });

    closeMatchModal();
    renderSchedule();
    renderStats();
    saveState(true);
  }

  function updateMatchTypeBadgeFromModal() {
    if (!modalDraft) {
      return;
    }

    const draft = normalizeMatch({
      clubAPlayerIds: [modalDraft.clubASelected[0] || "", modalDraft.clubASelected[1] || ""],
      clubBPlayerIds: [modalDraft.clubBSelected[0] || "", modalDraft.clubBSelected[1] || ""],
      scoreA: el.scoreAInput.value.trim(),
      scoreB: el.scoreBInput.value.trim(),
      memo: el.matchMemoInput.value.trim(),
    });

    const type = getMatchType(draft);
    el.matchTypeBadge.textContent = type.label;
    el.matchTypeBadge.className = `type-badge type-${type.code}`;
  }

  function refreshModalIfOpen() {
    if (el.matchModal.classList.contains("hidden") || !modalDraft) {
      return;
    }

    modalDraft.clubASelected = modalDraft.clubASelected.filter((id) => !!findPlayerById(0, id));
    modalDraft.clubBSelected = modalDraft.clubBSelected.filter((id) => !!findPlayerById(1, id));
    renderModalPicker(0);
    renderModalPicker(1);
    updateMatchTypeBadgeFromModal();
  }

  async function removeCourt(courtId) {
    if (!courtId) {
      return;
    }

    if (state.courts.length <= 1) {
      await appAlert("코트는 최소 1개 이상 필요합니다.", { title: "삭제 불가" });
      return;
    }

    const target = state.courts.find((court) => court.id === courtId);
    if (!target) {
      return;
    }

    const ok = await appConfirm(`\"${target.name || "코트"}\"를 삭제할까요? 해당 코트 경기 기록도 함께 삭제됩니다.`, {
      title: "코트 삭제 확인",
      confirmText: "삭제",
      confirmTone: "danger",
    });
    if (!ok) {
      return;
    }

    state.courts = state.courts.filter((court) => court.id !== courtId);

    const nextMatches = {};
    Object.entries(state.matches).forEach(([slotKey, match]) => {
      const parsed = parseSlotKey(slotKey);
      if (!parsed || parsed.courtId === courtId) {
        return;
      }
      nextMatches[slotKey] = match;
    });

    state.matches = nextMatches;
    renderSchedule();
    renderStats();
    saveState(true);
  }

  async function applyTimeConfigFromInputs() {
    const start = String(el.timeStartInput.value || "").trim();
    const end = String(el.timeEndInput.value || "").trim();
    const interval = Math.floor(Number(el.slotMinutesInput.value));

    const nextSlots = generateTimeSlots(start, end, interval);
    if (!nextSlots) {
      await appAlert("시간 설정이 올바르지 않습니다. 시작/종료 시간과 간격(분)을 확인해 주세요.", {
        title: "시간 설정 오류",
      });
      return;
    }

    if (nextSlots.length === 0) {
      await appAlert("생성 가능한 경기 시간이 없습니다.", { title: "시간 설정 오류" });
      return;
    }

    const oldMatches = state.matches;
    const oldLength = state.times.length;
    const nextMatches = {};

    state.courts.forEach((court) => {
      const keepCount = Math.min(oldLength, nextSlots.length);
      for (let i = 0; i < keepCount; i += 1) {
        const oldKey = makeSlotKey(i, court.id);
        const newKey = makeSlotKey(i, court.id);
        if (oldMatches[oldKey]) {
          nextMatches[newKey] = oldMatches[oldKey];
        }
      }
    });

    state.timeConfig = {
      start,
      end,
      interval,
    };
    state.times = nextSlots;
    state.matches = nextMatches;

    renderSchedule();
    renderStats();
    saveState(true);
  }

  function computeStats() {
    const clubStats = state.clubs.map(() => ({
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesFor: 0,
      gamesAgainst: 0,
      diff: 0,
    }));

    const playersMap = new Map();

    state.clubs.forEach((club, clubIndex) => {
      club.players.forEach((player) => {
        playersMap.set(player.id, {
          id: player.id,
          name: player.name || "이름없음",
          gender: player.gender,
          clubIndex,
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
        });
      });
    });

    Object.values(state.matches).forEach((match) => {
      if (!isCompletedScore(match)) {
        return;
      }

      const scoreA = toSafeNumber(match.scoreA);
      const scoreB = toSafeNumber(match.scoreB);

      clubStats[0].played += 1;
      clubStats[1].played += 1;
      clubStats[0].gamesFor += scoreA;
      clubStats[0].gamesAgainst += scoreB;
      clubStats[1].gamesFor += scoreB;
      clubStats[1].gamesAgainst += scoreA;

      let winner = -1;
      if (scoreA > scoreB) {
        clubStats[0].wins += 1;
        clubStats[1].losses += 1;
        winner = 0;
      } else if (scoreB > scoreA) {
        clubStats[1].wins += 1;
        clubStats[0].losses += 1;
        winner = 1;
      } else {
        clubStats[0].draws += 1;
        clubStats[1].draws += 1;
      }

      updatePlayersByResult(match.clubAPlayerIds, 0, winner, playersMap);
      updatePlayersByResult(match.clubBPlayerIds, 1, winner, playersMap);
    });

    clubStats.forEach((item) => {
      item.diff = item.gamesFor - item.gamesAgainst;
    });

    const players = Array.from(playersMap.values());
    players.forEach((player) => {
      player.winRate = player.played ? (player.wins / player.played) * 100 : 0;
    });

    const maxWins = players.reduce((acc, item) => Math.max(acc, item.wins), 0);
    const topPlayers = maxWins ? players.filter((item) => item.wins === maxWins) : [];
    const trendSeries = buildTrendSeries();

    return { clubStats, players, topPlayers, trendSeries };
  }

  function buildTrendSeries() {
    const trendSeries = [
      {
        label: "시작",
        matchDelta: 0,
        gameDelta: 0,
      },
    ];

    let matchDelta = 0;
    let gameDelta = 0;

    state.times.forEach((timeLabel, timeIndex) => {
      state.courts.forEach((court, courtIndex) => {
        const slotKey = makeSlotKey(timeIndex, court.id);
        const match = state.matches[slotKey];
        if (!match || !isCompletedScore(match)) {
          return;
        }

        const scoreA = toSafeNumber(match.scoreA);
        const scoreB = toSafeNumber(match.scoreB);

        if (scoreA > scoreB) {
          matchDelta += 1;
        } else if (scoreB > scoreA) {
          matchDelta -= 1;
        }

        gameDelta += scoreA - scoreB;

        trendSeries.push({
          label: `${timeLabel} · 코트 ${courtIndex + 1}`,
          matchDelta,
          gameDelta,
          scoreA,
          scoreB,
        });
      });
    });

    return trendSeries;
  }

  function renderTrendGraph(trendSeries) {
    if (!el.trendGraphWrap || !el.trendGraphHint) {
      return;
    }

    const clubAName = state.clubs[0]?.name || "좌측 클럽";
    const clubBName = state.clubs[1]?.name || "우측 클럽";

    if (!Array.isArray(trendSeries) || trendSeries.length <= 1) {
      el.trendGraphWrap.innerHTML = `<div class="empty-note">결과가 입력된 경기가 없어 그래프를 그릴 수 없습니다.</div>`;
      el.trendGraphHint.textContent = "점수를 입력하면 시간 흐름 그래프가 자동으로 갱신됩니다.";
      return;
    }

    const width = 980;
    const height = 300;
    const paddingX = 52;
    const paddingY = 26;
    const centerY = height / 2;
    const innerWidth = width - paddingX * 2;
    const maxAbs = Math.max(
      1,
      ...trendSeries.map((point) => Math.abs(point.matchDelta)),
      ...trendSeries.map((point) => Math.abs(point.gameDelta))
    );
    const yScale = (height / 2 - paddingY) / maxAbs;
    const xStep = trendSeries.length > 1 ? innerWidth / (trendSeries.length - 1) : 0;

    const toX = (index) => paddingX + xStep * index;
    const toY = (value) => centerY - value * yScale;

    const matchPoints = trendSeries
      .map((point, index) => `${toX(index).toFixed(2)},${toY(point.matchDelta).toFixed(2)}`)
      .join(" ");
    const gamePoints = trendSeries
      .map((point, index) => `${toX(index).toFixed(2)},${toY(point.gameDelta).toFixed(2)}`)
      .join(" ");

    const labels = trendSeries
      .map((point, index) => {
        const labelStep = Math.max(1, Math.ceil(trendSeries.length / 6));
        if (index !== 0 && index !== trendSeries.length - 1 && index % labelStep !== 0) {
          return "";
        }

        const x = toX(index);
        const y = height - 8;
        const text = index === 0 ? "시작" : `#${index}`;
        return `<text class="trend-x-label" x="${x.toFixed(2)}" y="${y}" text-anchor="middle">${escapeHtml(text)}</text>`;
      })
      .join("");

    const matchDots = trendSeries
      .map((point, index) => {
        const x = toX(index).toFixed(2);
        const y = toY(point.matchDelta).toFixed(2);
        const title = `${point.label}\n승패차: ${formatSigned(point.matchDelta)}\n득실차: ${formatSigned(point.gameDelta)}`;
        return `<circle class="trend-dot trend-dot-match" cx="${x}" cy="${y}" r="3.4"><title>${escapeHtml(title)}</title></circle>`;
      })
      .join("");

    const gameDots = trendSeries
      .map((point, index) => {
        const x = toX(index).toFixed(2);
        const y = toY(point.gameDelta).toFixed(2);
        const title = `${point.label}\n승패차: ${formatSigned(point.matchDelta)}\n득실차: ${formatSigned(point.gameDelta)}`;
        return `<circle class="trend-dot trend-dot-game" cx="${x}" cy="${y}" r="2.8"><title>${escapeHtml(title)}</title></circle>`;
      })
      .join("");

    const topGuideY = toY(maxAbs).toFixed(2);
    const bottomGuideY = toY(-maxAbs).toFixed(2);

    el.trendGraphWrap.innerHTML = `
      <div class="trend-legend">
        <span class="trend-legend-item trend-legend-match">승패 흐름</span>
        <span class="trend-legend-item trend-legend-game">득실차</span>
      </div>
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="시간 흐름 그래프">
        <line class="trend-grid-line" x1="${paddingX}" y1="${topGuideY}" x2="${width - paddingX}" y2="${topGuideY}" />
        <line class="trend-grid-line trend-grid-zero" x1="${paddingX}" y1="${centerY}" x2="${width - paddingX}" y2="${centerY}" />
        <line class="trend-grid-line" x1="${paddingX}" y1="${bottomGuideY}" x2="${width - paddingX}" y2="${bottomGuideY}" />
        <text class="trend-side-label trend-side-up" x="${paddingX + 6}" y="18">${escapeHtml(clubAName)} 우세 ▲</text>
        <text class="trend-side-label trend-side-down" x="${paddingX + 6}" y="${height - 20}">${escapeHtml(clubBName)} 우세 ▼</text>
        <text class="trend-zero-label" x="${paddingX - 14}" y="${centerY + 4}">0</text>
        <polyline class="trend-line trend-line-match" points="${matchPoints}" />
        <polyline class="trend-line trend-line-game" points="${gamePoints}" />
        ${matchDots}
        ${gameDots}
        ${labels}
      </svg>
    `;

    const latest = trendSeries[trendSeries.length - 1];
    el.trendGraphHint.textContent = `현재 누적: 승패차 ${formatSigned(latest.matchDelta)}, 득실차 ${formatSigned(
      latest.gameDelta
    )}`;
  }

  function updatePlayersByResult(playerIds, clubIndex, winner, playersMap) {
    playerIds.forEach((playerId) => {
      if (!playerId) {
        return;
      }

      const fallbackPlayer = findPlayerById(clubIndex, playerId);
      if (!playersMap.has(playerId)) {
        playersMap.set(playerId, {
          id: playerId,
          name: fallbackPlayer?.name || "삭제된 선수",
          gender: fallbackPlayer?.gender || "",
          clubIndex,
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
        });
      }

      const target = playersMap.get(playerId);
      target.played += 1;

      if (winner === -1) {
        target.draws += 1;
      } else if (winner === clubIndex) {
        target.wins += 1;
      } else {
        target.losses += 1;
      }
    });
  }

  function getMatchType(match) {
    const gendersA = match.clubAPlayerIds.map((id) => findPlayerById(0, id)?.gender).filter(Boolean);
    const gendersB = match.clubBPlayerIds.map((id) => findPlayerById(1, id)?.gender).filter(Boolean);

    if (gendersA.length < 2 || gendersB.length < 2) {
      return MATCH_TYPE.pending;
    }

    const all = [...gendersA, ...gendersB];

    if (all.every((gender) => gender === "M")) {
      return MATCH_TYPE.male;
    }

    if (all.every((gender) => gender === "F")) {
      return MATCH_TYPE.female;
    }

    const teamAMixed = new Set(gendersA).size === 2;
    const teamBMixed = new Set(gendersB).size === 2;

    if (teamAMixed && teamBMixed) {
      return MATCH_TYPE.mixed;
    }

    return MATCH_TYPE.open;
  }

  function renderPairPlayersHtml(clubIndex, playerIds) {
    return playerIds
      .map((playerId) => {
        if (!playerId) {
          return renderPlayerLabelHtml("미정", "");
        }

        const player = findPlayerById(clubIndex, playerId);
        if (!player) {
          return renderPlayerLabelHtml("삭제된 선수", "");
        }

        return renderPlayerLabelHtml(player.name || "이름없음", player.gender);
      })
      .join("");
  }

  function renderPlayerLabelHtml(name, gender) {
    const cls = genderClassName(gender);

    return `<span class="player-label ${cls}"><span class="player-label-name">${escapeHtml(name)}</span></span>`;
  }

  function genderClassName(gender) {
    if (gender === "M") {
      return "gender-m";
    }
    if (gender === "F") {
      return "gender-f";
    }
    return "gender-u";
  }

  function removePlayer(clubIndex, playerId) {
    const club = state.clubs[clubIndex];
    club.players = club.players.filter((item) => item.id !== playerId);

    Object.keys(state.matches).forEach((slotKey) => {
      const match = state.matches[slotKey];
      state.matches[slotKey] = {
        ...match,
        clubAPlayerIds: match.clubAPlayerIds.map((id) => (id === playerId ? "" : id)),
        clubBPlayerIds: match.clubBPlayerIds.map((id) => (id === playerId ? "" : id)),
      };
    });

    if (modalDraft) {
      modalDraft.clubASelected = modalDraft.clubASelected.filter((id) => id !== playerId);
      modalDraft.clubBSelected = modalDraft.clubBSelected.filter((id) => id !== playerId);
    }

    if (editingPlayer && editingPlayer.playerId === playerId && editingPlayer.clubIndex === clubIndex) {
      editingPlayer = null;
    }
  }

  function countMatchesByPlayerId(playerId) {
    let count = 0;

    Object.values(state.matches).forEach((match) => {
      if (match.clubAPlayerIds.includes(playerId) || match.clubBPlayerIds.includes(playerId)) {
        count += 1;
      }
    });

    return count;
  }

  function findPlayerById(clubIndex, playerId) {
    return state.clubs[clubIndex]?.players.find((player) => player.id === playerId) || null;
  }

  function makeSlotKey(timeIndex, courtId) {
    return `${timeIndex}::${courtId}`;
  }

  function parseSlotKey(slotKey) {
    const [timeIndexRaw, courtId] = String(slotKey).split("::");
    const timeIndex = Number(timeIndexRaw);

    if (!Number.isInteger(timeIndex) || !courtId) {
      return null;
    }

    return { timeIndex, courtId };
  }

  function compactPlayerIds(playerIds) {
    const source = Array.isArray(playerIds) ? playerIds : [];
    const result = [];

    source.forEach((id) => {
      const value = String(id || "").trim();
      if (!value || result.includes(value)) {
        return;
      }
      result.push(value);
    });

    return result.slice(0, 2);
  }

  function startNowLineTimer() {
    if (nowLineTimer) {
      window.clearInterval(nowLineTimer);
    }

    syncNowLine();
    nowLineTimer = window.setInterval(syncNowLine, 30000);
  }

  function syncNowLine() {
    if (!el.nowLine || !el.scheduleTable || !el.tableWrap) {
      return;
    }

    const current = getCurrentTimePosition();
    if (!current) {
      el.nowLine.classList.add("hidden");
      return;
    }

    const rowEl = el.scheduleTable.querySelector(`tbody tr[data-time-index="${current.timeIndex}"]`);
    if (!rowEl) {
      el.nowLine.classList.add("hidden");
      return;
    }

    const wrapRect = el.tableWrap.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const top = rowRect.top - wrapRect.top + rowRect.height * current.ratio + el.tableWrap.scrollTop;

    el.nowLine.style.top = `${top}px`;
    el.nowLine.style.width = `${el.scheduleTable.scrollWidth}px`;
    el.nowLine.style.transform = `translateX(${-el.tableWrap.scrollLeft}px)`;
    el.nowLineLabel.textContent = `현재 ${current.label}`;
    el.nowLine.classList.remove("hidden");
  }

  function getCurrentTimePosition() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < state.times.length; i += 1) {
      const range = parseTimeRangeLabel(state.times[i]);
      if (!range) {
        continue;
      }

      const duration = range.end - range.start;
      if (duration <= 0) {
        continue;
      }

      if (nowMinutes >= range.start && nowMinutes <= range.end) {
        const ratio = clamp((nowMinutes - range.start) / duration, 0, 1);
        return {
          timeIndex: i,
          ratio,
          label: toHHMM(nowMinutes),
        };
      }
    }

    return null;
  }

  function parseTimeRangeLabel(label) {
    const [startRaw, endRaw] = String(label || "").split("-");
    const start = toMinutes(startRaw);
    const end = toMinutes(endRaw);

    if (start === null || end === null) {
      return null;
    }

    return { start, end };
  }

  function isCompletedScore(match) {
    const scoreA = toNullableNumber(match.scoreA);
    const scoreB = toNullableNumber(match.scoreB);
    return scoreA !== null && scoreB !== null;
  }

  function toNullableNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }

    return num;
  }

  function toSafeNumber(value) {
    return toNullableNumber(value) ?? 0;
  }

  function saveState(showMessage, options = {}) {
    const { forceSync = false, skipSync = false, saveMessage = "저장 완료" } = options;
    state.updatedAt = new Date().toISOString();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const shouldSync = syncConnected && !syncPullInProgress && !skipSync && forceSync;
    if (shouldSync) {
      queueSyncPush({ immediate: !!showMessage || forceSync });
    }

    if (showMessage) {
      const finalSaveMessage =
        syncConnected && !shouldSync ? "로컬 저장 완료 (클라우드 미반영)" : saveMessage;
      renderSaveStatus(finalSaveMessage);
      window.clearTimeout(saveHintTimer);
      saveHintTimer = window.setTimeout(() => {
        renderSaveStatus();
      }, 1200);
      return;
    }

    renderSaveStatus();
  }

  function renderSaveStatus(message) {
    if (message) {
      el.saveStatus.textContent = message;
      return;
    }

    const updated = state.updatedAt ? new Date(state.updatedAt) : null;
    if (!updated || Number.isNaN(updated.getTime())) {
      el.saveStatus.textContent = "자동 저장 준비됨";
      return;
    }

    const stamp = updated.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    el.saveStatus.textContent = `자동 저장: ${stamp}`;
  }

  function downloadAutoBackupJson() {
    saveState(false);
    downloadStateSnapshot({
      filenamePrefix: "tennis-club-auto-backup",
      statusMessage: "자동 백업 다운로드 완료",
    });
  }

  function downloadStateSnapshot({ filenamePrefix, statusMessage }) {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const now = formatFileTimestamp(new Date());
    a.href = url;
    a.download = `${filenamePrefix}-${now}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    renderSaveStatus(statusMessage || "백업 다운로드 완료");
    window.clearTimeout(saveHintTimer);
    saveHintTimer = window.setTimeout(() => renderSaveStatus(), 1200);
  }

  function formatFileTimestamp(date) {
    const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const year = String(safeDate.getFullYear());
    const month = String(safeDate.getMonth() + 1).padStart(2, "0");
    const day = String(safeDate.getDate()).padStart(2, "0");
    const hour = String(safeDate.getHours()).padStart(2, "0");
    const minute = String(safeDate.getMinutes()).padStart(2, "0");
    const second = String(safeDate.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
  }

  function importFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        state = normalizeState(parsed);
        editingPlayer = null;
        playerSortState = [defaultPlayerSort(), defaultPlayerSort()];
        renderAll();
        saveState(true);
      } catch (error) {
        await appAlert("JSON 파일 형식이 올바르지 않습니다.", { title: "불러오기 오류" });
      }
    };

    reader.readAsText(file);
    event.target.value = "";
  }

  function loadState() {
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current) {
        return JSON.parse(current);
      }

      for (const key of LEGACY_STORAGE_KEYS) {
        const legacy = window.localStorage.getItem(key);
        if (legacy) {
          return JSON.parse(legacy);
        }
      }

      return defaultState();
    } catch (error) {
      return defaultState();
    }
  }

  function defaultState() {
    const times = generateTimeSlots(
      DEFAULT_TIME_CONFIG.start,
      DEFAULT_TIME_CONFIG.end,
      DEFAULT_TIME_CONFIG.interval
    );

    return {
      matchName: "",
      matchDate: "",
      matchLocation: "",
      updatedAt: "",
      clubs: [
        { id: createId("club"), name: "그린테니스", players: [] },
        { id: createId("club"), name: "행빡테니스", players: [] },
      ],
      courts: Array.from({ length: 4 }, (_, index) => ({
        id: createId("court"),
        name: `코트${index + 1}`,
      })),
      timeConfig: { ...DEFAULT_TIME_CONFIG },
      times,
      matches: {},
    };
  }

  function normalizeState(input) {
    const base = defaultState();
    const source = isObject(input) ? input : {};

    const clubsSource = Array.isArray(source.clubs) ? source.clubs.slice(0, 2) : [];
    while (clubsSource.length < 2) {
      clubsSource.push(base.clubs[clubsSource.length]);
    }

    const clubs = clubsSource.map((club, index) => normalizeClub(club, base.clubs[index].name));

    const courtsSource = Array.isArray(source.courts) && source.courts.length > 0 ? source.courts : base.courts;
    const courts = courtsSource.map((court, index) => normalizeCourt(court, index));

    const timeConfig = normalizeTimeConfig(source.timeConfig, source.times);

    const sourceTimes = Array.isArray(source.times)
      ? source.times.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const generatedTimes =
      generateTimeSlots(timeConfig.start, timeConfig.end, timeConfig.interval) ||
      generateTimeSlots(DEFAULT_TIME_CONFIG.start, DEFAULT_TIME_CONFIG.end, DEFAULT_TIME_CONFIG.interval) ||
      [];

    const times = sourceTimes.length > 0 ? sourceTimes : generatedTimes;

    const matchesSource = isObject(source.matches) ? source.matches : {};
    const matches = {};

    Object.entries(matchesSource).forEach(([slotKey, match]) => {
      const parsed = parseSlotKey(slotKey);
      if (!parsed) {
        return;
      }

      const validTime = parsed.timeIndex >= 0 && parsed.timeIndex < times.length;
      const validCourt = courts.some((court) => court.id === parsed.courtId);
      if (!validTime || !validCourt) {
        return;
      }

      matches[slotKey] = normalizeMatch(match);
    });

    return {
      matchName: String(source.matchName || ""),
      matchDate: String(source.matchDate || ""),
      matchLocation: String(source.matchLocation || ""),
      updatedAt: String(source.updatedAt || ""),
      clubs,
      courts,
      timeConfig,
      times,
      matches,
    };
  }

  function normalizeTimeConfig(rawConfig, rawTimes) {
    const source = isObject(rawConfig) ? rawConfig : {};

    const start = isHHMM(source.start) ? source.start : deriveTimeStart(rawTimes) || DEFAULT_TIME_CONFIG.start;
    const end = isHHMM(source.end) ? source.end : deriveTimeEnd(rawTimes) || DEFAULT_TIME_CONFIG.end;
    const interval = Number.isFinite(Number(source.interval)) ? Number(source.interval) : deriveTimeInterval(rawTimes);

    const safeInterval =
      Number.isFinite(interval) && interval >= 5 && interval <= 180
        ? Math.floor(interval)
        : DEFAULT_TIME_CONFIG.interval;

    if (toMinutes(start) === null || toMinutes(end) === null || toMinutes(end) <= toMinutes(start)) {
      return { ...DEFAULT_TIME_CONFIG };
    }

    return {
      start,
      end,
      interval: safeInterval,
    };
  }

  function deriveTimeStart(rawTimes) {
    if (!Array.isArray(rawTimes) || rawTimes.length === 0) {
      return "";
    }

    const first = parseTimeRangeLabel(rawTimes[0]);
    return first ? toHHMM(first.start) : "";
  }

  function deriveTimeEnd(rawTimes) {
    if (!Array.isArray(rawTimes) || rawTimes.length === 0) {
      return "";
    }

    const last = parseTimeRangeLabel(rawTimes[rawTimes.length - 1]);
    return last ? toHHMM(last.end) : "";
  }

  function deriveTimeInterval(rawTimes) {
    if (!Array.isArray(rawTimes) || rawTimes.length === 0) {
      return DEFAULT_TIME_CONFIG.interval;
    }

    const first = parseTimeRangeLabel(rawTimes[0]);
    if (!first) {
      return DEFAULT_TIME_CONFIG.interval;
    }

    const value = first.end - first.start;
    return value > 0 ? value : DEFAULT_TIME_CONFIG.interval;
  }

  function generateTimeSlots(startHHMM, endHHMM, intervalMinutes) {
    const start = toMinutes(startHHMM);
    const end = toMinutes(endHHMM);
    const interval = Number(intervalMinutes);

    if (
      start === null ||
      end === null ||
      !Number.isFinite(interval) ||
      interval < 5 ||
      interval > 180 ||
      end <= start
    ) {
      return null;
    }

    const slots = [];
    for (let cursor = start; cursor + interval <= end; cursor += interval) {
      slots.push(`${toHHMM(cursor)}-${toHHMM(cursor + interval)}`);
    }

    return slots;
  }

  function normalizeClub(club, fallbackName) {
    const source = isObject(club) ? club : {};
    const players = Array.isArray(source.players) ? source.players : [];

    return {
      id: source.id ? String(source.id) : createId("club"),
      name: String(source.name || fallbackName || "클럽"),
      players: players.map((player) => normalizePlayer(player)),
    };
  }

  function normalizePlayer(player) {
    const source = isObject(player) ? player : {};

    return {
      id: source.id ? String(source.id) : createId("player"),
      name: String(source.name || ""),
      gender: source.gender === "F" ? "F" : "M",
      experience: String(source.experience || ""),
      age: source.age === undefined || source.age === null ? "" : String(source.age),
    };
  }

  function normalizeCourt(court, index) {
    const source = isObject(court) ? court : {};

    return {
      id: source.id ? String(source.id) : createId("court"),
      name: String(source.name || `코트${index + 1}`),
    };
  }

  function emptyMatch() {
    return {
      clubAPlayerIds: ["", ""],
      clubBPlayerIds: ["", ""],
      scoreA: "",
      scoreB: "",
      memo: "",
    };
  }

  function normalizeMatch(match) {
    const source = isObject(match) ? match : {};
    const clubAPlayerIds = Array.isArray(source.clubAPlayerIds)
      ? source.clubAPlayerIds.slice(0, 2).map((item) => String(item || ""))
      : ["", ""];
    const clubBPlayerIds = Array.isArray(source.clubBPlayerIds)
      ? source.clubBPlayerIds.slice(0, 2).map((item) => String(item || ""))
      : ["", ""];

    while (clubAPlayerIds.length < 2) {
      clubAPlayerIds.push("");
    }
    while (clubBPlayerIds.length < 2) {
      clubBPlayerIds.push("");
    }

    return {
      clubAPlayerIds,
      clubBPlayerIds,
      scoreA: normalizeScore(source.scoreA),
      scoreB: normalizeScore(source.scoreB),
      memo: String(source.memo || ""),
    };
  }

  function normalizeScore(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return "";
    }

    return String(Math.floor(num));
  }

  function toMinutes(hhmm) {
    const text = String(hhmm || "").trim();
    const matched = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!matched) {
      return null;
    }

    const hour = Number(matched[1]);
    const minute = Number(matched[2]);

    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return hour * 60 + minute;
  }

  function toHHMM(totalMinutes) {
    const minutes = ((Number(totalMinutes) % 1440) + 1440) % 1440;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function isHHMM(value) {
    return toMinutes(value) !== null;
  }

  function formatSigned(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return "0";
    }
    if (num > 0) {
      return `+${num}`;
    }
    return String(num);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function isObject(value) {
    return typeof value === "object" && value !== null;
  }
})();
