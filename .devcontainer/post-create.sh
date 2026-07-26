#!/bin/bash
# Projenin mevcut kurulum komutları buraya (varsa), hata verirse devam et
# örn: npm install || echo "UYARI: npm install başarısız"

# claude-config senkronu (skill + agent + MCP kurulum scripti)
if git clone https://github.com/hakansenipek/claude-config /tmp/claude-config 2>/dev/null; then
  mkdir -p ~/.claude
  rm -rf ~/.claude/skills ~/.claude/agents
  cp -r /tmp/claude-config/skills ~/.claude/ || echo "UYARI: skills kopyalanamadı"
  cp -r /tmp/claude-config/agents ~/.claude/ || echo "UYARI: agents kopyalanamadı"
  cp /tmp/claude-config/setup-mcp.sh ~/.claude/setup-mcp.sh || echo "UYARI: setup-mcp.sh kopyalanamadı"
  rm -rf /tmp/claude-config
  echo "claude-config senkronu tamam: $(ls ~/.claude/skills | wc -l) skill, $(ls ~/.claude/agents | wc -l) agent"
else
  echo "UYARI: claude-config clone edilemedi (403 ise yeni codespace gerekli, rebuild yetmez)"
fi

# NOT: setup-mcp.sh burada ÇALIŞTIRILMIYOR — claude authorize henüz tamamlanmamış oluyor,
# çalıştırma adımı postAttachCommand'a taşındı (yukarıda 1. maddede eklendi)
