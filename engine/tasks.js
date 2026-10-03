// ============================================================
// 任务系统
// 数据：
//   卡带定义  card.worldbook.tasks（可留空，AI 生成也行）
//   运行时    /saves/{cardId}/{saveId}/tasks_runtime.json
// 逻辑：任务有若干 step，每个 step 有触发条件（复用 Events 的判定）
//       全部 step 完成 → 任务完成 → 发奖励
// ============================================================

(function() {
  var Tasks = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/tasks_runtime.json';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = { tasks: {} }; return; }
      var d = VFS.readJSON(p);
      this._data = d && d.tasks ? d : { tasks: {} };
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      this.save();
    },

    // ============ 卡带定义 + 运行时合并 ============
    listDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.tasks || [];
    },

    // 拿全部任务（含运行时状态）
    listAll: function() {
      if (!this._data) this.load();
      var defs = this.listDefs();
      var out = [];

      defs.forEach(function(def) {
        var rt = this._data.tasks[def.id] || {};
        out.push(this._merge(def, rt));
      }, this);

      // 运行时里存了但卡带里没有的（AI 临时生成的）
      Object.keys(this._data.tasks).forEach(function(id) {
        if (defs.some(function(d) { return d.id === id; })) return;
        var rt = this._data.tasks[id];
        if (rt._def) out.push(this._merge(rt._def, rt));
      }, this);

      return out;
    },

    _merge: function(def, rt) {
      return {
        id: def.id,
        name: def.name,
        desc: def.desc || '',
        type: def.type || 'side',    // main / side / daily
        priority: def.priority != null ? def.priority : 5,
        visible: def.visible !== false,
        status: rt.status || 'active',  // active / done / failed / abandoned
        steps: (def.steps || []).map(function(s, i) {
          var stepRt = (rt.steps && rt.steps[s.id]) || {};
          return {
            id: s.id,
            desc: s.desc || '',
            done: !!stepRt.done,
            doneAt: stepRt.doneAt || '',
            active: i === 0 || (rt.steps && rt.steps[(def.steps[i-1] || {}).id] && rt.steps[(def.steps[i-1] || {}).id].done),
            trigger: s.trigger || null
          };
        }),
        reward: def.reward || null,
        failWhen: def.failWhen || null,
        startedAt: rt.startedAt || '',
        doneAt: rt.doneAt || '',
        failedAt: rt.failedAt || '',
        failReason: rt.failReason || ''
      };
    },

    // ============ 运行时操作 ============
    _ensureRuntime: function(taskId) {
      if (!this._data) this.load();
      if (!this._data.tasks[taskId]) {
        this._data.tasks[taskId] = {
          status: 'active',
          steps: {},
          startedAt: GameState.formatGameTime()
        };
      }
      return this._data.tasks[taskId];
    },

    // AI 临时加一个任务
    addTemp: function(def) {
      if (!this._data) this.load();
      if (!def || !def.name) return { ok: false, reason: '缺少 name' };
      if (!def.id) def.id = 'task_temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      var cardDefs = this.listDefs();
      var inCard = cardDefs.some(function(d) { return d.id === def.id; });
      if (inCard) {
        def.id = def.id + '_temp_' + Date.now();
      }
      var rt = this._ensureRuntime(def.id);
      rt._def = def;
      this.save();
      return { ok: true, id: def.id, name: def.name };
    },

    // 完成某 step
    completeStep: function(taskId, stepId) {
      if (!this._data) this.load();
      var def = this._findDef(taskId);
      if (!def) return { ok: false, reason: '任务不存在' };
      var rt = this._ensureRuntime(taskId);
      if (rt.status !== 'active') return { ok: false, reason: '任务状态不是 active' };
      if (!rt.steps[stepId]) rt.steps[stepId] = {};
      if (rt.steps[stepId].done) return { ok: false, reason: '该步骤已完成' };
      rt.steps[stepId].done = true;
      rt.steps[stepId].doneAt = GameState.formatGameTime();
      this.save();

      // 检查是否全部完成
      var allDone = (def.steps || []).every(function(s) {
        return rt.steps[s.id] && rt.steps[s.id].done;
      });
      if (allDone) {
        return this.completeTask(taskId);
      }
      return { ok: true, taskId: taskId, stepId: stepId, taskCompleted: false };
    },

    // 完成整个任务
    completeTask: function(taskId) {
      if (!this._data) this.load();
      var def = this._findDef(taskId);
      if (!def) return { ok: false, reason: '任务不存在' };
      var rt = this._ensureRuntime(taskId);
      if (rt.status === 'done') return { ok: false, reason: '已完成' };
      rt.status = 'done';
      rt.doneAt = GameState.formatGameTime();
      this.save();

      // 发奖励
      var rewardApplied = [];
      if (def.reward) {
        if (Array.isArray(def.reward.hudChanges)) {
          def.reward.hudChanges.forEach(function(c) {
            var r = ToolExecutor._modifyStat('hud', null, c.key, c.delta);
            if (r.ok) rewardApplied.push('HUD·' + c.key + ' +' + c.delta);
          });
        }
        if (Array.isArray(def.reward.addItems)) {
          def.reward.addItems.forEach(function(c) {
            var r = ToolExecutor._addItem(c.category || 'common', c.name, c.desc);
            if (r.ok) rewardApplied.push('获得 ' + c.name);
          });
        }
        if (def.reward.promptHint) rewardApplied.push('叙事：' + def.reward.promptHint);
      }

      return {
        ok: true,
        type: 'task',
        action: 'complete',
        taskId: taskId,
        taskName: def.name,
        rewardApplied: rewardApplied,
        label: '完成任务·' + def.name
      };
    },

    // 失败
    failTask: function(taskId, reason) {
      if (!this._data) this.load();
      var def = this._findDef(taskId);
      if (!def) return { ok: false, reason: '任务不存在' };
      var rt = this._ensureRuntime(taskId);
      if (rt.status !== 'active') return { ok: false, reason: '不是 active' };
      rt.status = 'failed';
      rt.failedAt = GameState.formatGameTime();
      rt.failReason = reason || '';
      this.save();
      return {
        ok: true,
        type: 'task',
        action: 'fail',
        taskId: taskId,
        taskName: def.name,
        reason: reason,
        label: '任务失败·' + def.name
      };
    },

    // 放弃
    abandonTask: function(taskId) {
      if (!this._data) this.load();
      var def = this._findDef(taskId);
      if (!def) return { ok: false, reason: '任务不存在' };
      var rt = this._ensureRuntime(taskId);
      rt.status = 'abandoned';
      this.save();
      return {
        ok: true,
        type: 'task',
        action: 'abandon',
        taskId: taskId,
        taskName: def.name,
        label: '放弃任务·' + def.name
      };
    },

    _findDef: function(taskId) {
      if (!this._data) this.load();
      var defs = this.listDefs();
      var found = defs.find(function(d) { return d.id === taskId; });
      if (found) return found;
      // 运行时临时任务
      var rt = this._data.tasks[taskId];
      return rt && rt._def ? rt._def : null;
    },

    // ============ 每轮检查 step 触发 ============
    tick: function() {
      if (!this._data) this.load();
      var all = this.listAll();
      var completed = [];
      var self = this;

      all.forEach(function(t) {
        if (t.status !== 'active') return;
        // 检查每个 step
        t.steps.forEach(function(step) {
          if (step.done) return;
          if (!step.trigger) return;
          // 用 Events 的判定逻辑
          if (typeof Events === 'undefined') return;
          var ck = Events._checkTrigger({ trigger: step.trigger });
          if (!ck.ok) return;
          // step 命中 → 完成它
          var r = self.completeStep(t.id, step.id);
          if (r.ok && r.taskCompleted) completed.push(r);
        });
      });

      // 检查 failWhen
      all.forEach(function(t) {
        if (t.status !== 'active') return;
        if (!t.failWhen) return;
        if (typeof Events === 'undefined') return;
        var ck = Events._checkTrigger({ trigger: t.failWhen });
        if (ck.ok) {
          var r = self.failTask(t.id, t.failWhen.reason || '');
          if (r.ok) completed.push(r);
        }
      });

      return { completed: completed };
    },

    // ============ 给 prompt 用 ============
    formatForPrompt: function() {
      if (!this._data) this.load();
      var all = this.listAll();
      var active = all.filter(function(t) { return t.status === 'active' && t.visible; });
      if (!active.length) return '';

      var lines = ['>>> 【进行中的任务】'];
      active.slice(0, 8).forEach(function(t) {
        var doneSteps = t.steps.filter(function(s) { return s.done; }).length;
        var total = t.steps.length;
        var typeLabel = { main: '主线', side: '支线', daily: '日常' }[t.type] || '支线';
        var s = '· [' + typeLabel + '] ' + t.name;
        if (total > 0) s += '（' + doneSteps + '/' + total + '）';
        if (t.desc) s += '：' + t.desc;
        lines.push(s);
        // 当前活跃 step
        var activeStep = t.steps.find(function(s) { return !s.done; });
        if (activeStep) lines.push('  → 当前：' + activeStep.desc);
      });
      lines.push('');
      return lines.join('\n');
    },

    formatForHistory: function(results) {
      if (!results || !results.length) return '';
      var lines = ['【系统 · 任务状态】'];
      results.forEach(function(r) {
        if (r.action === 'complete') {
          lines.push('· ✓ 完成【' + r.taskName + '】');
          (r.rewardApplied || []).forEach(function(x) { lines.push('   ' + x); });
        } else if (r.action === 'fail') {
          lines.push('· ✗ 任务失败【' + r.taskName + '】' + (r.reason ? '：' + r.reason : ''));
        } else if (r.action === 'abandon') {
          lines.push('· ⊘ 放弃【' + r.taskName + '】');
        }
      });
      return lines.join('\n');
    },

    // ============ 调试 ============
    clear: function() {
      this._data = { tasks: {} };
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Tasks 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Tasks] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var T = Tasks;

    ToolExecutor.WHITELIST.add_task = {
      run: function(a) {
        if (!a.task) return { ok: false, reason: '缺少 task 对象' };
        var def = a.task;
        if (!def.id) def.id = 'task_' + Date.now();
        var r = T.addTemp(def);
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'task',
          action: 'add',
          taskId: r.id,
          taskName: r.name,
          label: '新增任务·' + r.name
        };
      }
    };

    ToolExecutor.WHITELIST.complete_step = {
      run: function(a) {
        if (!a.taskId || !a.stepId) return { ok: false, reason: '缺少参数' };
        var r = T.completeStep(a.taskId, a.stepId);
        if (!r.ok) return r;
        return { ok: true, type: 'task', action: 'step', taskId: a.taskId, stepId: a.stepId, taskCompleted: r.taskCompleted, label: '任务步骤完成' };
      }
    };

    ToolExecutor.WHITELIST.complete_task = {
      run: function(a) {
        if (!a.taskId) return { ok: false, reason: '缺少 taskId' };
        return T.completeTask(a.taskId);
      }
    };

    ToolExecutor.WHITELIST.fail_task = {
      run: function(a) {
        if (!a.taskId) return { ok: false, reason: '缺少 taskId' };
        return T.failTask(a.taskId, a.reason || '');
      }
    };

    ToolExecutor.WHITELIST.abandon_task = {
      run: function(a) {
        if (!a.taskId) return { ok: false, reason: '缺少 taskId' };
        return T.abandonTask(a.taskId);
      }
    };

    ToolExecutor.WHITELIST.query_tasks = {
      run: function() {
        var all = T.listAll();
        return {
          ok: true,
          type: 'query',
          queryType: 'tasks',
          data: {
            active: all.filter(function(t) { return t.status === 'active'; }).length,
            done: all.filter(function(t) { return t.status === 'done'; }).length,
            list: all.map(function(t) {
              return { id: t.id, name: t.name, status: t.status, type: t.type };
            })
          }
        };
      }
    };
  }

  // P16·B1：同步注册（原为 setTimeout(registerTools, 900~1900ms) 错峰注册）。
  //   错峰注册让冷启动后约 2 秒内 ToolExecutor.WHITELIST 只有内置的 15 个工具，AI 此时
  //   调用本模块的工具会拿到「未知工具：xxx」；而未知工具要连续失败 3 次才会提示 AI，
  //   中间它会反复重试同一个不存在的工具、白烧 token。ToolExecutor 在两仓的装载顺序里
  //   都排在本模块之前（index.html 的 <script> 顺序 / rn_bootstrap.js 的 load 顺序），
  //   所以这里可以直接同步注册。
  if (typeof ToolExecutor !== 'undefined' && ToolExecutor.WHITELIST) {
    registerTools();
  } else {
    // 顺序异常时的兜底：只退到下一轮事件循环（原实现要等 900~1900ms）。
    // registerTools 自己的就绪检查会写一条 BOOT 错误，不会静默少工具。
    setTimeout(registerTools, 0);
  }

  if (typeof window !== 'undefined') window.Tasks = Tasks;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tasks;
})();