from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
ASSETS = ROOT / "src" / "assets"
FONTS = ASSETS / "fonts"

PAGE_W, PAGE_H = A4

P = {
    "canvas": colors.HexColor("#0a0a0f"),
    "panel": colors.HexColor("#11141d"),
    "card": colors.HexColor("#161a26"),
    "raised": colors.HexColor("#1d2230"),
    "ink": colors.HexColor("#f0f0f5"),
    "mid": colors.HexColor("#c2c2cc"),
    "low": colors.HexColor("#74748a"),
    "line": colors.HexColor("#2a2d3a"),
    "purple": colors.HexColor("#61378e"),
    "violet": colors.HexColor("#8b5cf6"),
    "emerald": colors.HexColor("#10b981"),
    "paper": colors.HexColor("#f6f1e9"),
}

CONTENT = {
    "en": {
        "file": "bonzai-agentic-teams-onepager-en.pdf",
        "eyebrow": "AGENTIC TEAMS FOR SMB OPERATIONS",
        "title": "Install an AI operating team inside your business.",
        "intro": (
            "BonzAI finds the workflows that leak time, margin, and attention, then "
            "turns them into supervised agent teams that execute daily operations."
        ),
        "signal": "Audit the workflows. Deploy the teams. Keep control.",
        "commercial": "5,000€ TTC audit + 500€ TTC per agentic team",
        "detail_title": "Turn hidden operating costs into a managed AI workforce.",
        "detail_intro": (
            "BonzAI starts with the work already inside your business: inboxes, tools, files, "
            "approvals, follow-ups, reporting. The audit identifies where automation can "
            "increase margin fastest; each deployed team becomes a controlled operating unit."
        ),
        "offer": [
            ("01", "TTC automation audit", "5,000€ TTC", "Map work, quantify cost leaks, rank opportunities, define the first teams to launch."),
            ("02", "Agentic team launch", "500€ TTC", "Flat fee per team with instructions, workflows, control points, and reporting cadence."),
        ],
        "loop": [
            ("Sense", "Collect inputs from tools, inboxes, files, CRM, accounting, and team notes."),
            ("Decide", "Classify, prioritize, draft, compare, route, and flag exceptions."),
            ("Act", "Prepare outputs, update systems, trigger follow-ups, and request approval."),
            ("Report", "Expose savings, cycle times, risks, and next-best automations."),
        ],
        "loop_label": "OPERATING LOOP",
        "teams_label": "AGENTIC TEAMS",
        "outcomes_label": "OWNER OUTCOMES",
        "teams": [
            ("Finance Ops", "Invoices, reconciliations, cash alerts, supplier follow-up"),
            ("Sales Ops", "CRM hygiene, lead enrichment, quotes, reminders"),
            ("Support Ops", "Ticket triage, first replies, routing, escalation packs"),
            ("Owner Cockpit", "Dashboards, exceptions, decisions, weekly action lists"),
        ],
        "outcomes": [
            "Margin improvement visible before scaling",
            "Less manual admin and coordination drag",
            "Human approval where risk or judgment matters",
        ],
        "footer": "Book the 5K TTC audit",
    },
    "fr": {
        "file": "bonzai-agentic-teams-onepager-fr.pdf",
        "eyebrow": "EQUIPES D'AGENTS IA POUR PME",
        "title": "Déployez une équipe d'agents IA dans vos opérations.",
        "intro": (
            "BonzAI repère les tâches répétitives qui consomment vos marges, "
            "puis les transforme en équipes d'agents supervisées qui exécutent, "
            "contrôlent et reportent le travail au quotidien."
        ),
        "signal": "Auditer les processus. Déployer les équipes. Garder le contrôle.",
        "commercial": "Audit 5 000€ TTC + 500€ TTC par équipe d'agents",
        "detail_title": "Transformer les coûts cachés en force de travail IA pilotée.",
        "detail_intro": (
            "BonzAI part du travail déjà présent dans l'entreprise: mails, outils, fichiers, "
            "validations, relances, reporting. L'audit identifie les automatisations les plus "
            "rentables; chaque équipe déployée devient une unité opérationnelle contrôlée."
        ),
        "offer": [
            ("01", "Audit d'automatisation", "5 000€ TTC", "Cartographier les processus, chiffrer les pertes de temps et classer les opportunités par ROI."),
            ("02", "Lancement d'une équipe IA", "500€ TTC", "Prix fixe par équipe avec rôles, consignes, points de contrôle et reporting."),
        ],
        "loop": [
            ("Capter", "Collecter les entrées depuis vos outils, mails, fichiers, CRM et comptabilité."),
            ("Prioriser", "Classer, comparer, rédiger, router et signaler les exceptions."),
            ("Exécuter", "Préparer les livrables, mettre à jour les systèmes et lancer les relances."),
            ("Piloter", "Suivre les gains, les délais, les risques et les prochaines automatisations."),
        ],
        "loop_label": "BOUCLE OPERATIONNELLE",
        "teams_label": "EQUIPES IA",
        "outcomes_label": "RESULTATS DIRIGEANT",
        "teams": [
            ("Finance", "Factures, rapprochements, alertes cash, suivi fournisseurs"),
            ("Commercial", "CRM propre, enrichissement prospects, devis, relances"),
            ("Service client", "Triage tickets, premières réponses, routage, escalades"),
            ("Pilotage", "Tableaux de bord, exceptions, décisions, actions hebdo"),
        ],
        "outcomes": [
            "Des gains de marge visibles avant de déployer plus largement",
            "Moins d'administratif et de coordination manuelle",
            "Validation humaine quand le risque ou le jugement l'exige",
        ],
        "footer": "Réserver l'audit 5K TTC",
    },
}


def setup():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Fira", str(FONTS / "FiraSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("FiraLight", str(FONTS / "FiraSans-Light.ttf")))
    pdfmetrics.registerFont(TTFont("FiraDisplay", str(FONTS / "FiraSansCondensed-BlackItalic.ttf")))


def prep_image(src, dest):
    img = Image.open(src).convert("RGB")
    img.save(dest, "PNG", optimize=True)
    return dest


def cover_crop(img, width, height, x_bias=0.46, y_bias=0.5):
    iw, ih = img.size
    scale = max(width / iw, height / ih)
    resized = img.resize((int(iw * scale), int(ih * scale)), Image.Resampling.LANCZOS)
    rw, rh = resized.size
    left = int((rw - width) * x_bias)
    top = int((rh - height) * y_bias)
    return resized.crop((left, top, left + width, top + height))


def make_cover_backdrop(src, dest):
    scale = 2
    width, height = int(PAGE_W * scale), int(PAGE_H * scale)
    image_h = int(430 * scale)
    bg = Image.new("RGB", (width, height), "#0a0a0f")
    strip = cover_crop(Image.open(src).convert("RGB"), width, image_h)
    dark = Image.new("RGB", (width, image_h), "#0a0a0f")
    mask = Image.new("L", (width, image_h), 0)
    px = mask.load()
    fade_start = int(image_h * 0.56)
    for y in range(image_h):
        base = 18
        if y > fade_start:
            t = (y - fade_start) / (image_h - fade_start)
            base = int(18 + 237 * (t ** 1.45))
        for x in range(width):
            px[x, y] = base
    strip = Image.composite(dark, strip, mask)
    bg.paste(strip, (0, 0))
    bg.save(dest, "JPEG", quality=92, optimize=True)
    return dest


def with_alpha(c, alpha):
    c.setFillAlpha(alpha)
    c.setStrokeAlpha(alpha)


def cover_image(c, path, x, y, w, h, opacity=1, x_bias=0.5, y_bias=0.5):
    with Image.open(path) as img:
        iw, ih = img.size
    scale = max(w / iw, h / ih)
    sw, sh = iw * scale, ih * scale
    c.saveState()
    if opacity < 1:
        with_alpha(c, opacity)
    c.drawImage(
        ImageReader(str(path)),
        x + (w - sw) * x_bias,
        y + (h - sh) * y_bias,
        sw,
        sh,
    )
    c.restoreState()


def wrap(text, font, size, width):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(test, font, size) <= width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_text(c, s, x, y, font="Fira", size=10, color=None, leading=None, width=None):
    if color:
        c.setFillColor(color)
    c.setFont(font, size)
    if not width:
        c.drawString(x, y, s)
        return y - (leading or size * 1.25)
    for line in wrap(s, font, size, width):
        c.drawString(x, y, line)
        y -= leading or size * 1.25
    return y


def brand_mark(c, x, y, dark=False):
    logo_path = ASSETS / "bonzai_logo-full.png"
    c.drawImage(ImageReader(str(logo_path)), x, y - 20, 78, 78, mask="auto")
    c.setFillColor(P["canvas"] if dark else P["ink"])
    c.setFont("Fira", 7.5)
    c.drawString(x + 92, y + 8.5, "agentic operating teams")


def panel(c, x, y, w, h, fill=P["card"], stroke=P["line"], radius=8, alpha=1):
    c.saveState()
    with_alpha(c, alpha)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.65)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.restoreState()


def draw_cover(c, d, cover_bg):
    c.drawImage(ImageReader(str(cover_bg)), 0, 0, PAGE_W, PAGE_H)

    m = 44
    brand_mark(c, m, PAGE_H - 64)
    draw_text(c, "BONZAI.SH", PAGE_W - 106, PAGE_H - 51, "Fira", 7.5, colors.Color(1, 1, 1, alpha=0.78))

    y = 346
    draw_text(c, d["eyebrow"], m, y, "Fira", 8.5, P["emerald"])
    y -= 48
    c.setFillColor(P["ink"])
    c.setFont("FiraDisplay", 42)
    for line in wrap(d["title"], "FiraDisplay", 42, 445):
        c.drawString(m, y, line)
        y -= 45
    y -= 6
    y = draw_text(c, d["intro"], m, y, "FiraLight", 12.5, P["mid"], 17.5, 420)

    c.saveState()
    with_alpha(c, 0.68)
    c.setStrokeColor(P["violet"])
    c.setLineWidth(0.8)
    c.line(m, y - 12, m + 198, y - 12)
    c.restoreState()
    draw_text(c, d["signal"], m, y - 39, "Fira", 10.5, P["ink"], width=410, leading=14)
    c.showPage()


def offer_block(c, x, y, w, h, item, accent):
    num, label, price, body = item
    panel(c, x, y, w, h, fill=P["panel"], stroke=P["line"])
    c.setFillColor(accent)
    c.setFont("FiraDisplay", 23)
    c.drawString(x + 16, y + h - 34, num)
    draw_text(c, label.upper(), x + 64, y + h - 24, "Fira", 7.3, P["low"], width=w - 80, leading=9)
    draw_text(c, price, x + 64, y + h - 55, "FiraDisplay", 25, P["ink"])
    draw_text(c, body, x + 16, y + 22, "FiraLight", 8.6, P["mid"], 11, w - 32)


def draw_loop(c, d, x, y, w):
    draw_text(c, d.get("loop_label", "OPERATING LOOP"), x, y + 112, "Fira", 8.2, P["emerald"])
    step_w = (w - 36) / 4
    for i, (name, body) in enumerate(d["loop"]):
        xx = x + i * (step_w + 12)
        panel(c, xx, y, step_w, 94, fill=P["card"], stroke=P["line"])
        c.setFillColor(P["violet"] if i % 2 else P["emerald"])
        c.circle(xx + 15, y + 74, 4.2, fill=1, stroke=0)
        draw_text(c, name, xx + 26, y + 68, "Fira", 9.4, P["ink"])
        draw_text(c, body, xx + 14, y + 45, "FiraLight", 6.9, P["mid"], 8.4, step_w - 26)
        if i < 3:
            c.saveState()
            c.setStrokeColor(P["violet"])
            c.setLineWidth(0.7)
            c.line(xx + step_w, y + 47, xx + step_w + 12, y + 47)
            c.restoreState()


def draw_detail(c, d, bg):
    is_fr = d["file"].endswith("-fr.pdf")
    labels = {
        "sequence": "SEQUENCE DE DEPLOIEMENT" if is_fr else "DEPLOYMENT SEQUENCE",
        "audit": "AUDITER" if is_fr else "AUDIT",
        "design": "ARCHITECTURER" if is_fr else "ARCHITECT",
        "deploy": "DEPLOYER" if is_fr else "DEPLOY",
        "design_price": "ROI MAP",
        "design_body": (
            "Transformer les opportunités en rôles, règles, garde-fous et points de validation."
            if is_fr
            else "Turn opportunities into roles, rules, guardrails, and approval points."
        ),
        "agent_menu": "EQUIPES PRETES A LANCER" if is_fr else "TEAMS READY TO LAUNCH",
        "owner_view": "CE QUE LE DIRIGEANT VOIT" if is_fr else "WHAT THE OWNER SEES",
        "run_mode": "MODE OPERATOIRE" if is_fr else "OPERATING MODE",
        "run_copy": (
            "Un déploiement progressif: une première équipe, des mesures réelles, puis extension aux workflows suivants."
            if is_fr
            else "Progressive rollout: one team first, real measurements, then expansion into the next workflows."
        ),
        "footer_left": d["commercial"],
    }

    c.setFillColor(P["canvas"])
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    cover_image(c, bg, 0, 0, PAGE_W, PAGE_H, opacity=0.12, x_bias=0.53, y_bias=0.5)
    c.saveState()
    with_alpha(c, 0.82)
    c.setFillColor(P["canvas"])
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.restoreState()

    m = 40
    brand_mark(c, m, PAGE_H - 61)
    draw_text(c, "02", PAGE_W - 57, PAGE_H - 53, "Fira", 8, P["low"])

    y = PAGE_H - 128
    c.setFillColor(P["ink"])
    c.setFont("FiraDisplay", 30)
    for line in wrap(d["detail_title"], "FiraDisplay", 30, 500):
        c.drawString(m, y, line)
        y -= 33
    y -= 4
    draw_text(c, d["detail_intro"], m, y, "FiraLight", 10.2, P["mid"], 14.2, 500)

    seq_y = 438
    draw_text(c, labels["sequence"], m, seq_y + 144, "Fira", 8.2, P["emerald"])
    c.saveState()
    c.setStrokeColor(P["violet"])
    c.setLineWidth(1)
    c.line(m + 12, seq_y + 91, PAGE_W - m - 12, seq_y + 91)
    c.restoreState()

    step_w = (PAGE_W - 2 * m - 28) / 3
    stages = [
        (labels["audit"], d["offer"][0][2], d["offer"][0][3], P["violet"]),
        (labels["design"], labels["design_price"], labels["design_body"], P["line"]),
        (labels["deploy"], d["offer"][1][2], d["offer"][1][3], P["emerald"]),
    ]
    for i, (title, price, body, accent) in enumerate(stages):
        x = m + i * (step_w + 14)
        if i == 1:
            c.setFillColor(P["panel"])
            c.setStrokeColor(P["line"])
        else:
            c.setFillColor(P["card"])
            c.setStrokeColor(accent)
        c.setLineWidth(0.75)
        c.roundRect(x, seq_y, step_w, 112, 8, fill=1, stroke=1)
        c.setFillColor(P["emerald"] if i == 2 else P["violet"])
        c.circle(x + 18, seq_y + 91, 5.2, fill=1, stroke=0)
        draw_text(c, title, x + 16, seq_y + 72, "Fira", 8.4, P["low"])
        draw_text(c, price, x + 16, seq_y + 45, "FiraDisplay", 22, P["ink"])
        draw_text(c, body, x + 16, seq_y + 26, "FiraLight", 7.2, P["mid"], 8.8, step_w - 32)

    middle_y = 226
    left_w = 306
    right_w = PAGE_W - 2 * m - left_w - 18
    panel(c, m, middle_y, left_w, 160, fill=P["panel"], stroke=P["line"])
    panel(c, m + left_w + 18, middle_y, right_w, 160, fill=P["panel"], stroke=P["line"])

    draw_text(c, labels["agent_menu"], m + 16, middle_y + 133, "Fira", 8.2, P["emerald"])
    for i, (name, body) in enumerate(d["teams"]):
        yy = middle_y + 105 - i * 29
        c.setFillColor(P["emerald"] if i % 2 == 0 else P["violet"])
        c.roundRect(m + 16, yy - 3, 66, 17, 8, fill=1, stroke=0)
        draw_text(c, name, m + 24, yy + 1.5, "Fira", 6.8, P["canvas"])
        draw_text(c, body, m + 96, yy, "FiraLight", 7.3, P["mid"], width=190, leading=8.5)

    draw_text(c, labels["owner_view"], m + left_w + 34, middle_y + 133, "Fira", 8.2, P["emerald"])
    for i, outcome in enumerate(d["outcomes"]):
        yy = middle_y + 105 - i * 35
        c.setFillColor(P["violet"] if i == 0 else P["raised"])
        c.roundRect(m + left_w + 34, yy - 7, 18, 18, 9, fill=1, stroke=0)
        draw_text(c, str(i + 1), m + left_w + 40, yy - 2, "Fira", 6.6, P["ink"])
        draw_text(c, outcome, m + left_w + 61, yy, "FiraLight", 8.2, P["mid"], 10, right_w - 73)

    panel(c, m, 88, PAGE_W - 2 * m, 92, fill=P["raised"], stroke=P["line"])
    draw_text(c, labels["run_mode"], m + 18, 147, "Fira", 8.2, P["emerald"])
    draw_text(c, labels["run_copy"], m + 18, 126, "FiraLight", 9.1, P["mid"], 12.5, 295)
    c.setFillColor(P["canvas"])
    c.roundRect(PAGE_W - m - 172, 112, 138, 32, 16, fill=1, stroke=0)
    draw_text(c, "bonzai.sh", PAGE_W - m - 128, 124, "Fira", 9.4, P["emerald"])

    panel(c, m, 31, PAGE_W - 2 * m, 32, fill=P["raised"], stroke=P["violet"])
    draw_text(c, labels["footer_left"], m + 15, 43.2, "Fira", 8.6, P["ink"])
    draw_text(c, d["footer"], PAGE_W - 150, 43.2, "Fira", 8.8, P["emerald"])
    c.showPage()


def draw_pdf(lang, d, bg, cover_bg):
    out = OUT_DIR / d["file"]
    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle(f"BonzAI Agentic Teams ({lang.upper()})")
    draw_cover(c, d, cover_bg)
    draw_detail(c, d, bg)
    c.save()
    return out


def main():
    setup()
    bg = ASSETS / "bonzai_brand_background.jpg"
    cover_bg = make_cover_backdrop(bg, TMP_DIR / "bonzai_cover_backdrop.jpg")
    for lang, d in CONTENT.items():
        print(draw_pdf(lang, d, bg, cover_bg))


if __name__ == "__main__":
    main()
