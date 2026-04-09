def build_analysis_prompt() -> str:
    return (
        "Analyze this screenshot and return ONLY valid JSON with these fields:\n"
        "{\n"
        '  "description": "2-3 concise sentences about what is visible",\n'
        '  "application": "foreground desktop app name",\n'
        '  "tags": ["5 short keywords"],\n'
        '  "summary": "1 short sentence"\n'
        "}\n\n"
        "Application rule (important): return the foreground desktop app name, not the website.\n"
        "Examples:\n"
        "- If a webpage is open in Chrome, application must be 'Google Chrome'.\n"
        "- If open in Firefox, application must be 'Mozilla Firefox'.\n"
        "- If coding window, application can be 'Visual Studio Code'.\n"
        "If uncertain, use 'Unknown'."
    )
