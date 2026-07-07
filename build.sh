#!/bin/bash
echo "Заменяем плейсхолдер в env.js..."
sed -i "s/{{SUPABASE_SERVICE_KEY}}/$SUPABASE_SERVICE_KEY/g" env.js
echo "Готово."
