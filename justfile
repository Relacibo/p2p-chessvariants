set dotenv-load := true

CLAUDE_BIN := "claude"
FROM := `date -d '6 months ago' +%Y-%m-%d`
TO   := `date +%Y-%m-%d`

default:
    @just --list

# Startet die Claude CLI mit dem Key aus der lokalen .env
claude *args:
    @echo "🚀 Starte Claude CLI mit lokalem Projekt-Key..."
    {{CLAUDE_BIN}} {{args}}

# Hilfsbefehl: Überprüft, welcher Key gerade aktiv ist (ohne ihn voll anzuzeigen)
check-claude:
    @echo "🔍 Überprüfe Umgebung..."
    @if [ -f .env ]; then echo "✅ Lokale .env-Datei gefunden."; else echo "❌ Keine lokale .env im Ordner."; fi
    @if [ -n "$ANTHROPIC_API_KEY" ]; then \
        echo "✅ ANTHROPIC_API_KEY ist geladen (Anfang: ${ANTHROPIC_API_KEY:0:12}...)"; \
    else \
        echo "❌ Kein Key aktiv."; \
    fi

# Hilfsbefehl: Erstellt schnell ein Template für die .env
init-claude:
    @if [ -f .env ]; then \
        echo "⚠️  .env existiert bereits."; \
    else \
        echo "ANTHROPIC_API_KEY=sk-ant-..." > .env; \
        echo "✅ .env-Template erstellt. Bitte trage deinen echten Key ein."; \
    fi

