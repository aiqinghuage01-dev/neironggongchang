#!/usr/bin/env python3
"""一键生成新 skill 的骨架文件 + 自动注册到系统(D-017)。

用法:
  python3 scripts/add_skill.py --slug 爆款改写 --key baokuan --icon 💥 --label 爆款改写

做 7 件事(幂等):
  1. 验证 ~/Desktop/skills/<slug>/SKILL.md 存在
  2. 生成 backend/services/<key>_pipeline.py (analyze + write 2 步模板)
  3. 生成 web/factory-<key>-v2.jsx (3 步 UI 模板)
  4. 注册 backend/api.py (import + 3 个 endpoint)
  5. 注册 shortvideo/ai.py DEFAULT_ENGINE_ROUTES (2 条路由)
  6. 注册 web/factory-shell.jsx NAV_MAIN (sidebar 入口)
  7. 注册 web/factory-app.jsx + web/index.html

做完后:
  - 重启 :8000(带 --reload 会自动)
  - 浏览器刷新 :8001
  - sidebar 出现新入口,点进去 3 步流程可用
  - 根据实际 skill 调 pipeline 里的 prompt 和 JSON schema
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# ─── Pipeline 模板 ───────────────────────────────────────

PIPELINE_TEMPLATE = '''"""{slug} skill pipeline (D-017 骨架生成 · 根据实际 skill 调整 prompt/schema)。

Skill 源: ~/Desktop/skills/{slug}/
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from shortvideo.ai import get_ai_client

SKILL_SLUG = "{slug}"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\\[[\\s\\S]*\\]" if wrap == "array" else r"\\{{[\\s\\S]*\\}}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── Step 1 · 分析输入 + 给切入角度 ──────────────────────

def analyze_input(input_text: str) -> dict[str, Any]:
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《{slug}》skill · 分析阶段。

===== skill 方法论(SKILL.md) =====
{{skill['skill_md']}}
"""
    prompt = f"""输入:
{{input_text.strip()}}

按 skill 方法论分析输入,给出 2-3 个切入角度。严格 JSON:
{{{{
  "analysis": {{{{"key_points": [], "insight": "一句话核心观点"}}}},
  "angles": [
    {{{{"label": "A. 角度名", "why": "为什么这角度", "opening_draft": "开场草稿"}}}}
  ]
}}}}"""
    ai = get_ai_client(route_key="{key}.analyze")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=2000)
    obj = _extract_json(r.text, "object") or {{}}
    return {{
        "analysis": obj.get("analysis", {{}}),
        "angles": obj.get("angles", []),
        "raw_tokens": r.total_tokens,
    }}


# ─── Step 2 · 基于选定角度写输出 ─────────────────────────

def write_output(input_text: str, analysis: dict[str, Any], angle: dict[str, Any]) -> dict[str, Any]:
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《{slug}》skill · 写作阶段。严格按 skill 方法论执行。

===== skill 方法论 =====
{{skill['skill_md']}}
"""
    prompt = f"""输入: {{input_text.strip()}}

已确认的分析:
{{json.dumps(analysis, ensure_ascii=False, indent=2)}}

用户选定角度: {{angle.get('label', '')}}
- 为什么: {{angle.get('why', '')}}
- 开场草稿: {{angle.get('opening_draft', '')}}

按 skill 要求写完整内容。直接输出正文,不要前言。"""
    ai = get_ai_client(route_key="{key}.write")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=5000)
    content = (r.text or "").strip()
    word_count = len(re.sub(r"\\s+", "", content))
    return {{
        "content": content,
        "word_count": word_count,
        "tokens": {{"total": r.total_tokens}},
    }}
'''


# ─── JSX 模板 ────────────────────────────────────────────

JSX_TEMPLATE = '''// factory-{key}-v2.jsx — {slug} skill (D-017 骨架)
// Skill 源: ~/Desktop/skills/{slug}/
// 3 步: 输入 → 选角度 → 看结果

const {pascal_upper}_STEPS = [
  {{ id: "input",    n: 1, label: "输入" }},
  {{ id: "angles",   n: 2, label: "选角度" }},
  {{ id: "write",    n: 3, label: "结果" }},
];

function Page{pascal}({{ onNav }}) {{
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [input, setInput] = React.useState("");
  const [analysis, setAnalysis] = React.useState(null);
  const [pickedAngle, setPickedAngle] = React.useState(null);
  const [script, setScript] = React.useState(null);
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => {{ api.get("/api/{key}/skill-info").then(setSkillInfo).catch(() => {{}}); }}, []);

  async function runStep({{ nextStep, rollbackStep, clearSetter, apiCall }}) {{
    if (clearSetter) clearSetter(null);
    setStep(nextStep);
    setLoading(true); setErr("");
    try {{ await apiCall(); }}
    catch (e) {{ setErr(e.message); if (rollbackStep) setStep(rollbackStep); }}
    finally {{ setLoading(false); }}
  }}

  function doAnalyze() {{
    if (!input.trim()) return;
    return runStep({{
      nextStep: "angles", rollbackStep: "input", clearSetter: setAnalysis,
      apiCall: async () => {{
        const r = await api.post("/api/{key}/analyze", {{ input: input.trim() }});
        setAnalysis(r);
      }},
    }});
  }}
  function pickAngle(angle) {{
    setPickedAngle(angle);
    return runStep({{
      nextStep: "write", rollbackStep: "angles", clearSetter: setScript,
      apiCall: async () => {{
        const r = await api.post("/api/{key}/write", {{
          input: input.trim(), analysis: analysis?.analysis || {{}}, angle,
        }});
        setScript(r);
      }},
    }});
  }}
  function reset() {{
    setStep("input"); setErr(""); setInput(""); setAnalysis(null);
    setPickedAngle(null); setScript(null);
    clearWorkflow("{key}");
  }}

  const wfState = {{ step, input, analysis, pickedAngle, script }};
  const wfRestore = (s) => {{
    if (s.step) setStep(s.step);
    if (s.input != null) setInput(s.input);
    if (s.analysis) setAnalysis(s.analysis);
    if (s.pickedAngle) setPickedAngle(s.pickedAngle);
    if (s.script) setScript(s.script);
  }};
  const wf = useWorkflowPersist({{ ns: "{key}", state: wfState, onRestore: wfRestore }});

  return (
    <div style={{{{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}}}>
      <{pascal}Header current={{step}} onBack={{() => onNav("home")}} skillInfo={{skillInfo}} />
      <div style={{{{ flex: 1, overflow: "auto" }}}}>
        <WfRestoreBanner show={{wf.hasSnapshot}} onDismiss={{wf.dismissSnapshot}}
          onClear={{() => {{ reset(); wf.dismissSnapshot(); }}}}
          label="{label} 工作流" />
        {{err && (
          <div style={{{{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}}}>
            ⚠️ {{err}}
          </div>
        )}}
        {{step === "input"  && <{pascal}StepInput input={{input}} setInput={{setInput}} onGo={{doAnalyze}} loading={{loading}} skillInfo={{skillInfo}} />}}
        {{step === "angles" && <{pascal}StepAngles analysis={{analysis}} loading={{loading}} onPick={{pickAngle}} onPrev={{() => setStep("input")}} onRegen={{doAnalyze}} />}}
        {{step === "write"  && <{pascal}StepWrite script={{script}} angle={{pickedAngle}} loading={{loading}} onPrev={{() => setStep("angles")}} onRewrite={{() => pickAngle(pickedAngle)}} onReset={{reset}} />}}
      </div>
    </div>
  );
}}

function {pascal}Header({{ current, onBack, skillInfo }}) {{
  return (
    <div style={{{{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${{T.border}}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}}}>
      <div style={{{{ display: "flex", alignItems: "center", gap: 8 }}}}>
        <div style={{{{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}}}>{icon}</div>
        <div style={{{{ fontSize: 13.5, fontWeight: 600 }}}}>{label} · 3 步</div>
        {{skillInfo && (
          <span style={{{{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}}}>
            用技能:{{skillInfo.slug}}
          </span>
        )}}
      </div>
      <div style={{{{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}}}>
        {{{pascal_upper}_STEPS.map((s, i) => {{
          const active = s.id === current;
          const done = {pascal_upper}_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={{s.id}}>
              <div style={{{{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted, whiteSpace: "nowrap",
              }}}}>
                <div style={{{{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}}}>{{done ? "✓" : s.n}}</div>
                {{s.label}}
              </div>
              {{i < {pascal_upper}_STEPS.length - 1 && <span style={{{{ color: T.muted3 }}}}>—</span>}}
            </React.Fragment>
          );
        }})}}
      </div>
      <ApiStatusLight />
      <button onClick={{onBack}} style={{{{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}}}>← 返回</button>
    </div>
  );
}}

function {pascal}StepInput({{ input, setInput, onGo, loading, skillInfo }}) {{
  const ready = !!input.trim() && !loading;
  return (
    <div style={{{{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}}}>
      <div style={{{{ textAlign: "center", marginBottom: 24 }}}}>
        <div style={{{{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8 }}}}>{label} {icon}</div>
        <div style={{{{ fontSize: 14, color: T.muted }}}}>（骨架由 scripts/add_skill.py 生成 · 请根据 SKILL.md 调整 prompt）</div>
      </div>
      <div style={{{{ background: "#fff", border: `1.5px solid ${{T.brand}}`, boxShadow: `0 0 0 5px ${{T.brandSoft}}`, borderRadius: 16, padding: 18 }}}}>
        <textarea rows={{8}} value={{input}} onChange={{e => setInput(e.target.value)}}
          placeholder="输入内容..."
          style={{{{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }}}}
        />
        <div style={{{{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${{T.borderSoft}}` }}}}>
          <div style={{{{ flex: 1 }}}} />
          <button onClick={{onGo}} disabled={{!ready}} style={{{{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}}}>{{loading ? "分析中..." : "分析 + 给角度 →"}}</button>
        </div>
      </div>
    </div>
  );
}}

function {pascal}StepAngles({{ analysis, loading, onPick, onPrev, onRegen }}) {{
  if (loading || !analysis) return <Spinning icon="🔍" phases={{[
    {{ text: "分析输入中", sub: "读 skill 方法论" }},
    {{ text: "提炼核心观点", sub: "" }},
    {{ text: "给 2-3 个切入角度", sub: "" }},
  ]}} />;
  const angles = analysis.angles || [];
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  return (
    <div style={{{{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}}}>
      <div style={{{{ marginBottom: 16 }}}}>
        <div style={{{{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}}}>挑个角度 🎯</div>
      </div>
      <div style={{{{ display: "flex", flexDirection: "column", gap: 12 }}}}>
        {{angles.map((a, i) => {{
          const hover = hoverIdx === i;
          return (
            <div key={{i}} onClick={{() => onPick(a)}}
              onMouseEnter={{() => setHoverIdx(i)}}
              onMouseLeave={{() => setHoverIdx(-1)}}
              style={{{{
                padding: 18, background: "#fff",
                border: `1px solid ${{hover ? T.brand : T.borderSoft}}`,
                boxShadow: hover ? `0 0 0 4px ${{T.brandSoft}}` : "none",
                borderRadius: 12, cursor: "pointer",
              }}}}>
              <div style={{{{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 }}}}>{{a.label}}</div>
              <div style={{{{ fontSize: 12, color: T.muted, marginBottom: 8 }}}}>💡 {{a.why}}</div>
              <div style={{{{ fontSize: 13.5, background: T.bg2, padding: "10px 14px", borderRadius: 6, borderLeft: `3px solid ${{T.brand}}` }}}}>
                🎬 "{{a.opening_draft}}"
              </div>
            </div>
          );
        }})}}
      </div>
      <div style={{{{ display: "flex", gap: 10, marginTop: 18 }}}}>
        <Btn variant="outline" onClick={{onPrev}}>← 改输入</Btn>
        <Btn onClick={{onRegen}}>🔄 重新分析</Btn>
      </div>
    </div>
  );
}}

function {pascal}StepWrite({{ script, angle, loading, onPrev, onRewrite, onReset }}) {{
  if (loading || !script) return <Spinning icon="✍️" phases={{[
    {{ text: "按你选的角度写", sub: "" }},
    {{ text: "处理细节", sub: "" }},
  ]}} />;
  const [copied, setCopied] = React.useState(false);
  function copy() {{
    navigator.clipboard?.writeText(script.content || "");
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }}
  return (
    <div style={{{{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}}}>
      <div style={{{{ marginBottom: 16 }}}}>
        <div style={{{{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}}}>{label}完成 · {{script.word_count}} 字</div>
        <div style={{{{ fontSize: 12, color: T.muted }}}}>角度: <b>{{angle?.label}}</b> · {{script.tokens?.total || "?"}} tokens</div>
      </div>
      <div style={{{{ background: "#fff", border: `1px solid ${{T.borderSoft}}`, borderRadius: 12, padding: 20, marginBottom: 14 }}}}>
        <textarea value={{script.content || ""}} readOnly
          style={{{{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 320 }}}} />
      </div>
      <div style={{{{ display: "flex", gap: 10 }}}}>
        <Btn variant="outline" onClick={{onPrev}}>← 换角度</Btn>
        <Btn onClick={{onRewrite}}>🔄 再来一版</Btn>
        <div style={{{{ flex: 1 }}}} />
        <Btn onClick={{copy}} variant={{copied ? "soft" : "default"}}>{{copied ? "✓ 已复制" : "📋 复制"}}</Btn>
        <Btn variant="primary" onClick={{onReset}}>再来一条</Btn>
      </div>
    </div>
  );
}}

Object.assign(window, {{ Page{pascal} }});
'''


API_PY_BLOCK = '''

# ═══════════════════════════════════════════════════════════════════
# {slug} skill 接入 (D-017 骨架,根据实际调整)
# Skill 源: ~/Desktop/skills/{slug}/
# ═══════════════════════════════════════════════════════════════════

{upper_key}_SKILL_SLUG = "{slug}"


@app.get("/api/{key}/skill-info")
def {key}_skill_info():
    try:
        return skill_loader.skill_info({upper_key}_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class {pascal}AnalyzeReq(BaseModel):
    input: str


@app.post("/api/{key}/analyze")
def {key}_analyze(req: {pascal}AnalyzeReq):
    return {key}_pipeline.analyze_input(req.input)


class {pascal}WriteReq(BaseModel):
    input: str
    analysis: dict[str, Any] = Field(default_factory=dict)
    angle: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/{key}/write")
def {key}_write(req: {pascal}WriteReq):
    return {key}_pipeline.write_output(req.input, req.analysis, req.angle)
'''


# ─── 工具函数 ────────────────────────────────────────────

def _to_pascal(s: str) -> str:
    """baokuan_gaixie → BaokuanGaixie"""
    return "".join(p[:1].upper() + p[1:] for p in re.split(r"[_-]", s) if p)


def _write_file(path: Path, content: str, force: bool) -> bool:
    if path.exists() and not force:
        print(f"  ⚠️ 已存在(跳过): {path.relative_to(ROOT)}  -- 用 --force 覆盖")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  ✓ 写入: {path.relative_to(ROOT)} ({len(content)} 字符)")
    return True


def _insert_before_anchor(path: Path, anchor_re: str, block: str, dedup_marker: str) -> bool:
    """在 anchor 前插入 block,若 dedup_marker 已存在则跳过(幂等)。"""
    text = path.read_text(encoding="utf-8")
    if dedup_marker in text:
        print(f"  = 已注册过(跳过): {path.relative_to(ROOT)}")
        return False
    m = re.search(anchor_re, text, re.MULTILINE)
    if not m:
        print(f"  ✗ 锚点未找到: {path.relative_to(ROOT)}  pattern={anchor_re!r}")
        return False
    new_text = text[:m.start()] + block + text[m.start():]
    path.write_text(new_text, encoding="utf-8")
    print(f"  ✓ 注册: {path.relative_to(ROOT)} (+{len(block)} 字符)")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="一键生成 skill 骨架")
    parser.add_argument("--slug", required=True, help="skill 目录名,e.g. 爆款改写")
    parser.add_argument("--key", required=True, help="python/js 标识符,e.g. baokuan (ASCII)")
    parser.add_argument("--icon", default="📝", help="sidebar 图标 emoji")
    parser.add_argument("--label", default=None, help="sidebar 显示名,默认=slug")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的骨架文件")
    args = parser.parse_args()

    label = args.label or args.slug
    pascal = _to_pascal(args.key)
    pascal_upper = args.key.upper().replace("-", "_")
    upper_key = args.key.upper().replace("-", "_")

    # 1. 验证 skill 存在
    skill_md = Path.home() / "Desktop" / "skills" / args.slug / "SKILL.md"
    if not skill_md.exists():
        print(f"❌ skill 不存在: {skill_md}")
        return 1
    print(f"=== 为 skill 「{args.slug}」生成骨架 (key={args.key}, pascal={pascal}) ===\n")

    fmt = dict(
        slug=args.slug, key=args.key, pascal=pascal,
        pascal_upper=pascal_upper, upper_key=upper_key,
        icon=args.icon, label=label,
    )

    # 2. pipeline.py
    pipeline_path = ROOT / "backend/services" / f"{args.key}_pipeline.py"
    _write_file(pipeline_path, PIPELINE_TEMPLATE.format(**fmt), args.force)

    # 3. factory-<key>-v2.jsx
    jsx_path = ROOT / "web" / f"factory-{args.key}-v2.jsx"
    _write_file(jsx_path, JSX_TEMPLATE.format(**fmt), args.force)

    # 4. 注册到 backend/api.py (在 if __name__ == "__main__": 前插入)
    api_py = ROOT / "backend/api.py"
    _insert_before_anchor(
        api_py,
        r'^if __name__ == "__main__":',
        API_PY_BLOCK.format(**fmt),
        dedup_marker=f'{args.key}_skill_info',
    )
    # 还要 import pipeline
    _insert_before_anchor(
        api_py,
        r'^# ═+\s*\n# 公众号文章 skill 接入',
        f'from backend.services import {args.key}_pipeline\n',
        dedup_marker=f'from backend.services import {args.key}_pipeline',
    )

    # 5. 注册 route_key 到 shortvideo/ai.py DEFAULT_ENGINE_ROUTES
    ai_py = ROOT / "shortvideo/ai.py"
    ai_routes_block = f'    # {args.slug} skill (D-017 骨架)\n    "{args.key}.analyze":    "deepseek",\n    "{args.key}.write":      "opus",\n'
    _insert_before_anchor(
        ai_py,
        r'^\}\s*\n\n\ndef _resolve_engine',
        ai_routes_block,
        dedup_marker=f'"{args.key}.analyze"',
    )

    # 6. 注册 sidebar nav_main entry
    shell_jsx = ROOT / "web/factory-shell.jsx"
    nav_entry = f'  {{ id: "{args.key}", icon: "{args.icon}", label: "{label}" }},\n'
    _insert_before_anchor(
        shell_jsx,
        r'^\];\s*\nconst NAV_ASSETS',
        nav_entry,
        dedup_marker=f'id: "{args.key}"',
    )

    # 7. 注册 factory-app.jsx route case
    app_jsx = ROOT / "web/factory-app.jsx"
    app_case = f'      case "{args.key}": return <Page{pascal} onNav={{setPage}} />;\n'
    _insert_before_anchor(
        app_jsx,
        r'^\s+default:\s+return <PageHome',
        app_case,
        dedup_marker=f'case "{args.key}"',
    )

    # 8. 注册 index.html script
    index_html = ROOT / "web/index.html"
    html_script = f'  <script type="text/babel" src="./factory-{args.key}-v2.jsx"></script>\n'
    _insert_before_anchor(
        index_html,
        r'^\s+<script type="text/babel" src="\./factory-settings\.jsx"',
        html_script,
        dedup_marker=f'factory-{args.key}-v2.jsx',
    )

    print(f"\n=== 完成 ===")
    print(f"下一步:")
    print(f"  1. 重启 :8000 (--reload 会自动捕获)")
    print(f"  2. 浏览器刷新 http://127.0.0.1:8001/")
    print(f"  3. sidebar 应出现 「{args.icon} {label}」")
    print(f"  4. 根据 {skill_md} 实际内容调 {pipeline_path.relative_to(ROOT)} 里的")
    print(f"     analyze_input / write_output 的 prompt 和 JSON schema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
