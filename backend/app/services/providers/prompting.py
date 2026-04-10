def build_analysis_prompt() -> str:
    return (
        "Analyze this screenshot and return ONLY valid JSON with these fields:\n"
        "{\n"
        '  "description": "a highly detailed visual analysis (120-220 words)",\n'
        '  "application": "foreground desktop app name",\n'
        '  "tags": ["5 short keywords"],\n'
        '  "summary": "a title-style phrase (4-8 words), not a full sentence"\n'
        "}\n\n"
        "Description requirements (critical):\n"
        "- Describe the layout and the main regions/panels visible on screen.\n"
        "- Mention important UI elements (buttons, forms, menus, tabs, status labels).\n"
        "- Include relevant visible text content and what it implies about user intent/task.\n"
        "- Capture what action appears to be happening (configuration, coding, browsing, debugging, etc.).\n"
        "- Mention notable visual signals (warnings, success states, errors, progress indicators).\n"
        "- Be specific and factual; avoid generic wording.\n\n"
        "Output rules:\n"
        "- Return JSON only, no markdown, no explanations outside JSON.\n"
        "- Keep keys exactly as specified.\n"
        "Application rule (important): return the foreground desktop app name, not the website.\n"
        "- Prioritize visible window title/header text to identify the app whenever possible.\n"
        "- If the title/header explicitly names an app (e.g. 'NGU Idle', 'Visual Studio Code'), use that exact app name.\n"
        "- Avoid generic labels if any plausible app name is visible.\n"
        "Examples:\n"
        "- If a webpage is open in Chrome, application must be 'Google Chrome'.\n"
        "- If open in Firefox, application must be 'Mozilla Firefox'.\n"
        "- If coding window, application can be 'Visual Studio Code'.\n"
        "If uncertain, use 'Unknown'."
    )
