---
description: How to handle build/script errors during development
---

# Protocol: Fix Build Errors First

1. **Stop and Assess**: If a browser verification step fails due to a page load error, or if you see compilation/minification errors in the logs (e.g., Hugo "MINIFY: failed to transform..."), **STOP** your current task immediately.

2. **Do Not Persist**: Do not attempt to bypass the error or continue testing other features. The broken build makes all verification unreliable.

3. **Diagnose**: 
   - Read the error message carefully.
   - Use `view_file` to inspect the problematic file around the line number reported in the error.
   - Look for common syntax issues: missing braces `}`, missing parenthesis `)`, unexpected tokens.

4. **Fix**: 
   - Apply a surgical fix using `replace_file_content` or `multi_replace_file_content`.
   - Ensure you are restoring the code structure correctly (checking matching braces).

5. **Verify Fix**: 
   - Check if the build error is resolved (e.g., by refreshing the page or checking logs if available).
   - Only AFTER the build is green, proceed with the original verification task.
