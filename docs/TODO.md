- [ ] **Gravatar E-Mail:** Freitextfeld in den Settings hinzufügen, damit Nutzer eine abweichende E-Mail für Gravatar festlegen können (Backend: gravatar_email Spalte in users Tabelle).
- [ ] **E-Mail Änderung & Validierung:** Logik zum Ändern der primären Account-E-Mail implementieren (inkl. E-Mail-Verifizierung).

## Skript-API / Spieler-Interaktion

- [ ] **Scriptable UI – generische Interaktionsfläche:** Ein UI-Bereich, den das Rhai-Skript steuern kann:
  - Beschriftete Buttons (das Skript definiert Label + Aktion)
  - Ausgabe-Textfelder / Log-Bereich
  - Alles wird als State Change modelliert (konsistent mit dem übrigen State-Ansatz)

- [ ] **Figurenpicker (Piece Picker):** Ein generischer Modal/Overlay-Dialog zur Figurenauswahl, der vom Skript per State Change geöffnet werden kann. Anwendungsfälle:
  - **Standard-Schach:** Bauernumwandlung – Skript füllt den Picker mit Dame/Turm/Läufer/Springer
  - **S-Chess:** Einsetzen von Hawk/Elephant aus der Hand
  - **Reserve Pile Konzept (alternativ):** Statt festem Picker könnte das Skript einen „Reserve Pile" mit beliebigen Figuren befüllen; der Spieler klickt eine davon an. Flexibler, aber etwas aufwändiger.
  - Bevorzugter Ansatz: einfacher Figurenpicker, da ausreichend generisch und weniger overengineered.
