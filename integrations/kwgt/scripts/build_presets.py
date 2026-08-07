#!/usr/bin/env python3
"""
Builds the 5 premium OSLIFE KWGT widgets as real, importable .kwgt files.

The preset.json schema used here (RootLayerModule/StackLayerModule/OverlapLayerModule/
ShapeModule/TextModule, globals_list, internal_toggles/internal_formulas, the wg()
web-get-json formula function, KUSTOM_ACTION/TEXT_UPDATE touch events) was reverse
engineered from real, working .kwgt files pulled from public GitHub repos
(AumGupta/KWGT-Widgets, fergassss1/kwgt-widgets, YifePlayte/Genshin-DailyNote-KWGT) --
not guessed from memory. See integrations/kwgt/README.md for what's verified vs.
best-effort.

Usage: python3 build_presets.py
Output: ../presets/*.kwgt
"""
import json
import zipfile
from pathlib import Path

OUT_DIR = Path(__file__).parent.parent / "presets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_DEFAULT_URL = "https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/kwgt-api"

# ---- design tokens ("OSLIFE Glass") ---------------------------------------------
SURFACE = "#EB12141C"       # 92% dark graphite
STROKE = "#14FFFFFF"        # 8% white glass edge
TEXT_PRIMARY = "#FFF5F6FA"
TEXT_MUTED = "#FF9497A8"
TEXT_META = "#FF6B6E80"
RAIL = "#14FFFFFF"

ACCENTS = {
    "todo": "#FF7C6CF0",
    "focus": "#FFF5A524",
    "focus_overdue": "#FFF2545B",
    "projects": "#FF22D3AA",
    "braindump": "#FFEC4899",
    "heyra": "#FF38BDF8",
}

REFRESH_TAP = {"type": "SINGLE_TAP", "action": "KUSTOM_ACTION", "kustom_action": "TEXT_UPDATE"}

# ---- module builders --------------------------------------------------------------

def formula_field(d, field, expr, literal=None):
    """Attach a formula-driven value to a non-text field (toggle=10 == formula mode)."""
    d.setdefault("internal_toggles", {})[field] = 10
    d.setdefault("internal_formulas", {})[field] = f"${expr}$"
    if literal is not None:
        d[field] = literal


def shape(width_expr, height_expr, corners_expr, color, style=None, stroke=None, title=None):
    d = {"internal_type": "ShapeModule", "shape_type": "RECT"}
    if title:
        d["internal_title"] = title
    formula_field(d, "shape_width", width_expr, 100.0)
    formula_field(d, "shape_height", height_expr, 100.0)
    formula_field(d, "shape_corners", corners_expr, 20.0)
    d["paint_color"] = color
    if style:
        d["paint_style"] = style
    if stroke:
        d["paint_stroke"] = stroke
    return d


def text(expr_or_literal, size_expr, color, title=None, bold=False, align_right=False,
         padding=None, visible_expr=None, color_expr=None):
    txt = f"[b]{expr_or_literal}[/b]" if bold else expr_or_literal
    d = {"internal_type": "TextModule", "text_expression": txt}
    if title:
        d["internal_title"] = title
    formula_field(d, "text_size", size_expr, 14.0)
    d["paint_color"] = color
    if color_expr:
        formula_field(d, "paint_color", color_expr, color)
    if align_right:
        d["position_anchor"] = "TOPRIGHT"
    if padding:
        for k, v in padding.items():
            d[f"position_padding_{k}"] = v
    if visible_expr:
        formula_field(d, "config_visible", visible_expr, "ALWAYS")
    return d


def stack(children, stacking, margin=0.0, title=None, padding=None, visible_expr=None):
    d = {"internal_type": "StackLayerModule", "config_stacking": stacking,
         "config_margin": margin, "viewgroup_items": children}
    if title:
        d["internal_title"] = title
    if padding:
        for k, v in padding.items():
            if v is None:
                continue
            formula_field(d, f"position_padding_{k}", v, 0.0)
    if visible_expr:
        formula_field(d, "config_visible", visible_expr, "ALWAYS")
    return d


def overlap(children, title=None):
    d = {"internal_type": "OverlapLayerModule", "viewgroup_items": children}
    if title:
        d["internal_title"] = title
    return d


def background():
    """Shared 'OSLIFE Glass' card background: filled rounded rect + subtle glass edge."""
    fill = shape("gv(rw)", "gv(rh)", "gv(rh)/7", SURFACE, title="Bg")
    edge = shape("gv(rw)", "gv(rh)", "gv(rh)/7", STROKE, style="STROKE", stroke=2.0, title="Edge")
    return overlap([fill, edge], title="Background")


def api_call(widget, jsonpath, extra=""):
    """A wg() formula (without the surrounding $...$) fetching one JSON field from kwgt-api."""
    return (f'wg(gv(oslife_url)+"?w={widget}&secret="+gv(oslife_secret){extra},json,{jsonpath})')


def base_globals(extra=None):
    g = {
        "rw": {"index": 1, "type": "NUMBER", "title": "rw", "min": 0, "max": 2000,
               "toggles": 10, "global_formula": "$si(rwidth)$"},
        "rh": {"index": 2, "type": "NUMBER", "title": "rh", "min": 0, "max": 2000,
               "toggles": 10, "global_formula": "$si(rheight)$"},
        "oslife_url": {"index": 3, "type": "TEXT", "title": "OSLIFE API URL",
                        "description": "Basis-URL van je kwgt-api Edge Function (zie integrations/kwgt/README.md)",
                        "value": API_DEFAULT_URL},
        "oslife_secret": {"index": 4, "type": "TEXT", "title": "OSLIFE secret",
                            "description": "Jouw KWGT_WIDGETS_SECRET (Supabase -> Edge Functions -> Manage secrets)",
                            "value": ""},
    }
    if extra:
        g.update(extra)
    return g


def preset(title, width, height, globals_list, content, description=""):
    return {
        "preset_info": {
            "archive": None, "author": "OSLIFE", "description": description, "email": "",
            "features": "", "pflags": 0, "height": height, "locked": False, "release": 0,
            "title": title, "version": 1, "width": width, "xscreens": 0, "yscreens": 0,
        },
        "preset_root": {
            "internal_type": "RootLayerModule",
            "globals_list": globals_list,
            "internal_events": [REFRESH_TAP],
            "viewgroup_items": content,
        },
    }


def write_kwgt(name, data):
    path = OUT_DIR / f"{name}.kwgt"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("preset.json", json.dumps(data, ensure_ascii=False))
    print(f"wrote {path} ({path.stat().st_size} bytes)")


# ---- row helpers -------------------------------------------------------------------

def visible_if_count_gt(widget, index, extra=""):
    return f"if({api_call(widget, '.count', extra)}>{index},ALWAYS,REMOVE)"


PAD = "gv(rh)/12"

# ==== Widget 1: To-do lijst ==========================================================

def build_todo():
    accent = ACCENTS["todo"]
    header = stack([
        text("TO-DO", "gv(rh)/16", TEXT_MUTED),
        text(f"${api_call('todos', '.count')}$ open", "gv(rh)/16", accent, bold=True),
    ], "HORIZONTAL_CENTER", margin=8.0, title="Header")

    rows = []
    for i in range(4):
        title_expr = f"${api_call('todos', f'.items[{i}].title')}$"
        meta_expr = (
            f'$if({api_call("todos", f".items[{i}].overdue")}=true,"⚠ te laat",'
            f'{api_call("todos", f".items[{i}].due")})$'
        )
        meta_color_expr = (
            f'if({api_call("todos", f".items[{i}].overdue")}=true,{ACCENTS["focus_overdue"]},{TEXT_META})'
        )
        bullet = text("•", "gv(rh)/14", accent)
        title_col = stack([
            text(title_expr, "gv(rh)/14", TEXT_PRIMARY),
            text(meta_expr, "gv(rh)/22", TEXT_META, color_expr=meta_color_expr),
        ], "VERTICAL_LEFT", margin=2.0)
        row = stack([bullet, title_col], "HORIZONTAL_CENTER", margin=10.0,
                     visible_expr=visible_if_count_gt("todos", i))
        rows.append(row)

    body = stack([header, *rows], "VERTICAL_LEFT", margin=8.0,
                  padding={"top": PAD, "bottom": PAD, "left": PAD, "right": PAD})
    return preset("OSLIFE To-do lijst", 640, 320, base_globals(), [background(), body],
                   description="Open taken uit OSLIFE, overdue eerst. Tik om te verversen.")


# ==== Widget 2: Belangrijkste items ===================================================

def build_focus():
    accent = ACCENTS["focus"]
    pin_expr = f'$if({api_call("focus", ".isPinned")}=true,"\U0001F4CC","")$'
    header = stack([
        text("BELANGRIJKSTE VANDAAG", "gv(rh)/16", TEXT_MUTED),
        text(pin_expr, "gv(rh)/16", accent),
    ], "HORIZONTAL_CENTER", margin=8.0, title="Header")

    rows = []
    for i in range(3):
        num_color_expr = (
            f'if({api_call("focus", f".items[{i}].overdue")}=true,{ACCENTS["focus_overdue"]},{accent})'
        )
        number = text(str(i + 1), "gv(rh)/9", accent, bold=True, color_expr=num_color_expr)
        title_txt = text(f"${api_call('focus', f'.items[{i}].title')}$", "gv(rh)/14", TEXT_PRIMARY)
        domain_txt = text(f"${api_call('focus', f'.items[{i}].domain')}$", "gv(rh)/24", TEXT_META)
        title_col = stack([title_txt, domain_txt], "VERTICAL_LEFT", margin=2.0)
        row = stack([number, title_col], "HORIZONTAL_CENTER", margin=12.0,
                     visible_expr=visible_if_count_gt("focus", i))
        rows.append(row)

    body = stack([header, *rows], "VERTICAL_LEFT", margin=10.0,
                  padding={"top": PAD, "bottom": PAD, "left": PAD, "right": PAD})
    return preset("OSLIFE Belangrijkste items", 640, 320, base_globals(), [background(), body],
                   description="Vandaags 'Belangrijkste'-shortlist uit OSLIFE. Tik om te verversen.")


# ==== Widget 3: Actieve projecten ======================================================

def build_projects():
    accent = ACCENTS["projects"]
    header = stack([
        text("ACTIEVE PROJECTEN", "gv(rh)/16", TEXT_MUTED),
        text(f"${api_call('projects', '.count')}$ actief", "gv(rh)/16", accent, bold=True),
    ], "HORIZONTAL_CENTER", margin=8.0, title="Header")

    rows = []
    for i in range(3):
        name_expr = (
            f'$if(tc(len,{api_call("projects", f".items[{i}].client")})>0,'
            f'{api_call("projects", f".items[{i}].name")}+" — "+{api_call("projects", f".items[{i}].client")},'
            f'{api_call("projects", f".items[{i}].name")})$'
        )
        name_txt = text(name_expr, "gv(rh)/14", TEXT_PRIMARY)

        rail = shape("gv(rw)-2*(" + PAD + ")", "3", "1.5", RAIL, title="Rail")
        fill_w = (
            f'(gv(rw)-2*({PAD}))*{api_call("projects", f".items[{i}].progressPct")}/100'
        )
        fill = shape(fill_w, "3", "1.5", accent, title="Fill")
        bar = overlap([rail, fill], title="Progress")

        deadline_expr = (
            f'$if({api_call("projects", f".items[{i}].overdue")}=true,"⚠ te laat",'
            f'"nog "+{api_call("projects", f".items[{i}].daysLeft")}+" dagen")$'
        )
        deadline_txt = text(deadline_expr, "gv(rh)/24", TEXT_META)

        row_col = stack([name_txt, bar, deadline_txt], "VERTICAL_LEFT", margin=4.0,
                         visible_expr=visible_if_count_gt("projects", i))
        rows.append(row_col)

    body = stack([header, *rows], "VERTICAL_LEFT", margin=10.0,
                  padding={"top": PAD, "bottom": PAD, "left": PAD, "right": PAD})
    return preset("OSLIFE Actieve projecten", 640, 320, base_globals(), [background(), body],
                   description="Actieve projecten met voortgang en deadline. Tik om te verversen.")


# ==== Widget 4: Brain-dump quick add ===================================================

def build_braindump():
    accent = ACCENTS["braindump"]
    icon = text("+", "gv(rh)/3", accent, bold=True)
    label = text("BRAIN-DUMP", "gv(rh)/16", TEXT_MUTED)
    badge_expr = (
        f'$if({api_call("braindump-count", ".count")}>0,'
        f'{api_call("braindump-count", ".count")}+" vandaag vastgelegd","")$'
    )
    badge = text(badge_expr, "gv(rh)/20", TEXT_META)
    content = stack([icon, label, badge], "VERTICAL_CENTER", margin=6.0,
                     padding={"top": "gv(rh)/5"})
    return preset("OSLIFE Brain-dump", 320, 320, base_globals(), [background(), content],
                   description="Snel iets vastleggen in je OSLIFE Braindump. Open de app om te typen/dicteren.")


# ==== Widget 5: HEYRA quick chat/voice =================================================

def build_heyra():
    accent = ACCENTS["heyra"]
    icon = text("\U0001F4AC", "gv(rh)/4", accent)
    label = text("HEYRA", "gv(rh)/16", TEXT_MUTED)
    teaser_expr = (
        f'$if({api_call("focus", ".count")}>0,"Nu: "+{api_call("focus", ".items[0].title")},'
        f'"Tik om te chatten")$'
    )
    teaser = text(teaser_expr, "gv(rh)/20", TEXT_PRIMARY)
    content = stack([icon, label, teaser], "VERTICAL_CENTER", margin=6.0,
                     padding={"top": "gv(rh)/6", "left": "gv(rh)/10", "right": "gv(rh)/10"})
    return preset("OSLIFE HEYRA", 320, 320, base_globals(), [background(), content],
                   description="Korte HEYRA-teaser uit OSLIFE. Open de app voor het volledige gesprek/voice.")


if __name__ == "__main__":
    write_kwgt("01-todo-lijst", build_todo())
    write_kwgt("02-belangrijkste-items", build_focus())
    write_kwgt("03-actieve-projecten", build_projects())
    write_kwgt("04-braindump-quick-add", build_braindump())
    write_kwgt("05-heyra-quick-chat", build_heyra())
