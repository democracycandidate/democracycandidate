# Hugo Template Development Skill

## Overview
This skill provides guidelines for working with Hugo templates to avoid common syntax errors and maintain consistency across template files.

## Key Principles

### 1. Sorting Collections in Hugo Templates

**❌ INCORRECT:**
```go
{{ range ($pages | sort "Params.fieldname") }}
{{ range (($pages | sort "Params.fieldname") | collections.Reverse) }}
```

**✅ CORRECT:**
```go
{{ range sort $pages "Params.fieldname" }}           // Ascending order
{{ range sort $pages "Params.fieldname" "desc" }}    // Descending order
```

**Key Points:**
- Use the `sort` function with the collection as the first argument
- Parameter names should be in the format: `"Params.fieldname"`
- For descending order, add `"desc"` as the third argument
- Don't pipe collections to `sort` - pass them as the first argument
- Avoid using `collections.Reverse` - use `"desc"` parameter instead

### 2. Alternative Sorting Method (ByParam)

**✅ ALSO CORRECT:**
```go
{{ range .Pages.ByParam "election_date" }}           // Ascending
{{ range (.Pages.ByParam "election_date").Reverse }} // Descending
```

**When to use:**
- `.ByParam` method is useful when working with page collections
- More readable for simple parameter-based sorting
- Can chain with `.Reverse` for descending order

### 3. Partial Template Data Passing

**Best Practice:**
```go
{{ partial "components/template-name" (dict "Pages" .Pages "ShowSidebar" true "Context" .) }}
```

**Key Points:**
- Use `dict` to pass multiple named parameters to partials
- Always pass the context (`.`) if the partial needs access to site/page context
- Name parameters clearly for maintainability

### 4. Template Comments

**✅ CORRECT:**
```go
{{/* This is a comment */}}
{{/* 
Multi-line comment
explaining complex logic
*/}}
```

**Key Points:**
- Use `{{/* comment */}}` for Hugo template comments
- Regular HTML comments (`<!-- -->`) will be rendered in output
- Document complex logic and template parameters

### 5. Conditional Checks

**Best Practice:**
```go
{{ if gt (len $collection) 0 }}
  // Render content
{{ else }}
  // Fallback content
{{ end }}
```

**Key Points:**
- Always check collection length before iterating
- Provide meaningful fallback content for empty collections
- Use Hugo's comparison functions: `eq`, `ne`, `gt`, `lt`, `ge`, `le`

### 6. Internationalization (i18n) and Regionalization

**❌ INCORRECT - Hardcoded Text:**
```go
<h2>Upcoming Elections</h2>
<p>No upcoming elections at this time.</p>
```

**✅ CORRECT - Using Translation Function:**
```go
<h2>{{ T "upcoming_elections" | default "Upcoming Elections" }}</h2>
<p>{{ T "no_upcoming_elections" | default "No upcoming elections at this time." }}</p>
```

**Key Points:**
- **ALWAYS** use `{{ T "key" }}` for user-facing text in templates
- Never hardcode English (or any language) strings directly in templates
- Add translation keys to `i18n/en.yaml` (or other language files)
- Include `| default "fallback text"` for graceful degradation
- This applies to ALL user-visible text: headings, labels, messages, button text, etc.

**Translation File Structure (`i18n/en.yaml`):**
```yaml
upcoming_elections: Upcoming Elections
historical_elections: Historical Elections
no_upcoming_elections: No upcoming elections at this time.
candidate_photo: Candidate Photo
```

**Benefits:**
- Easy to add multiple languages without touching templates
- Centralized text management
- Consistent terminology across the site
- Simple to customize labels per deployment

**Common Translation Keys to Define:**
- Section headings and titles
- Button labels and calls-to-action
- Status messages and notifications
- Navigation labels
- Form field labels and placeholders
- Error and success messages

## Common Patterns

### Grouping and Filtering Pages

```go
{{ $today := now }}
{{ $upcoming := slice }}
{{ $past := slice }}

{{ range $pages }}
  {{ $electionDate := .Params.election_date }}
  {{ if $electionDate }}
    {{ if ge (time $electionDate) $today }}
      {{ $upcoming = $upcoming | append . }}
    {{ else }}
      {{ $past = $past | append . }}
    {{ end }}
  {{ end }}
{{ end }}
```

### Collecting Unique Values

```go
{{ $tags := slice }}
{{ range $pages }}
  {{ range .Params.tags }}
    {{ $tags = $tags | append . }}
  {{ end }}
{{ end }}
{{ $tags = $tags | uniq }}
```

## Template Organization

### File Structure
```
layouts/
  _default/
    taxonomy.html        // Category/tag listing pages
    list.html           // Section listing pages
  candidates/
    list.html           // Candidate section override
    single.html         // Individual candidate page
  partials/
    components/
      candidate-card.html        // Reusable card component
      candidate-list-grouped.html // Complex list logic
```

### Separation of Concerns
- **List Templates**: Handle page collection and layout structure
- **Partial Components**: Handle rendering logic and reusable UI elements
- **Single Templates**: Handle individual page rendering

## Error Prevention Checklist

- [ ] Sort functions use correct syntax: `sort $collection "Params.field"`
- [ ] No use of `collections.Reverse` - use `"desc"` parameter or `.Reverse` method
- [ ] Template comments use `{{/* */}}` not `<!-- -->`
- [ ] Check collection length before iterating
- [ ] Pass context to partials when needed
- [ ] Variables use proper Hugo naming: `$variableName`
- [ ] Consistent indentation for readability
- [ ] **ALL user-facing text uses `{{ T "key" }}` translation function**
- [ ] **NO hardcoded strings in English or any language**
- [ ] Translation keys defined in `i18n/en.yaml` (and other language files as needed)

## Testing Templates

**Run Development Server:**
```bash
cd src
npm run dev
```

**Watch for Errors:**
- Build errors will show line numbers and template names
- Common error: `error calling sort: can't sort string` = incorrect sort syntax
- Common error: `nil pointer` = missing data or incorrect variable reference

## Real-World Example from Fix

### Issue Found
```go
// WRONG - caused "can't sort string" error
{{ range ($upcoming | sort "Params.election_date") }}
{{ range (($past | sort "Params.election_date") | collections.Reverse) }}
```

### Solution Applied
```go
// CORRECT - passes collection as first argument
{{ range sort $upcoming "Params.election_date" }}
{{ range sort $past "Params.election_date" "desc" }}
```

### Root Cause
The pipe operator `|` was incorrectly used to pass the collection to `sort`. Hugo's `sort` function expects the collection as a direct argument, not piped input.

## Real-World Example: Regionalization Fix

### Issue Found
```go
// WRONG - hardcoded English text
<h2 class="h3 mb-6 text-center">
  <i class="fa-solid fa-calendar-check mr-2 text-primary"></i>
  Upcoming Election Tags
</h2>
<p class="text-lg">No upcoming elections at this time. Check back closer to your local election dates!</p>
```

### Solution Applied
```go
// CORRECT - using translation function
<h2 class="h3 mb-6 text-center">
  <i class="fa-solid fa-calendar-check mr-2 text-primary"></i>
  {{ T "upcoming_election_tags" | default "Upcoming Election Tags" }}
</h2>
<p class="text-lg">{{ T "no_upcoming_elections" | default "No upcoming elections at this time. Check back closer to your local election dates!" }}</p>
```

**Translation File (`i18n/en.yaml`):**
```yaml
upcoming_election_tags: Upcoming Election Tags
historical_election_tags: Historical Election Tags
no_upcoming_elections: No upcoming elections at this time. Check back closer to your local election dates!
```

### Benefits
- Site can now support multiple languages by adding `i18n/es.yaml`, `i18n/fr.yaml`, etc.
- Labels can be customized per deployment without modifying templates
- All user-facing text is centralized and easily auditable

## Additional Resources

- Hugo Template Documentation: https://gohugo.io/templates/
- Hugo Functions: https://gohugo.io/functions/
- Hugo Sorting: https://gohugo.io/functions/sort/
- Hugo i18n: https://gohugo.io/functions/i18n/

## Version Info

- Hugo Version: v0.152.2 (extended)
- Last Updated: January 24, 2026
