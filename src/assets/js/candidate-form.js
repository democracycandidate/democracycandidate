// Initialize EasyMDE
const easyMDE = new EasyMDE({
    element: document.getElementById('content-editor'),
    placeholder: 'Write your biography here...',
    spellChecker: true,
    autosave: {
        enabled: true,
        uniqueId: 'candidate-submission',
        delay: 5000,
    },
    toolbar: ['bold', 'italic', 'heading', '|', 'unordered-list', 'ordered-list', '|', 'link', 'preview', 'side-by-side', 'fullscreen', 'guide'],
    initialValue: `### Policy

[Describe your policy positions and what you stand for]

### Experience

[Share your relevant experience and qualifications]

### Collaboration

[Explain how you work with others and build consensus]`
});

// Character counter for about field
const aboutField = document.getElementById('about');
const aboutCount = document.getElementById('about-count');
const aboutWarning = document.getElementById('about-warning');

if (aboutField && aboutCount) {
    aboutField.addEventListener('input', () => {
        const length = aboutField.value.length;
        aboutCount.textContent = length;

        // Update Preview
        const previewBio = document.getElementById('preview-bio');
        const cardPreview = document.getElementById('card-preview');
        if (previewBio && cardPreview) {
            let bioText = aboutField.value;
            if (bioText.length > 150) {
                bioText = bioText.substring(0, 150) + '...';
            }
            previewBio.textContent = bioText;

            if (bioText.length > 0) {
                cardPreview.classList.remove('hidden');
            } else {
                // Only hide if no image is present? 
                // Alternatively, keep hidden if text is empty and let image upload handle unhiding.
                // For now, if text is empty, check if image is visible.
                const img = cardPreview.querySelector('img');
                if (img.classList.contains('hidden')) {
                    cardPreview.classList.add('hidden');
                }
            }
        }

        if (length > 150) {
            if (aboutWarning) aboutWarning.classList.remove('hidden');
            aboutCount.parentElement.classList.add('text-orange-600');
            aboutCount.parentElement.classList.remove('text-gray-500');
        } else {
            if (aboutWarning) aboutWarning.classList.add('hidden');
            aboutCount.parentElement.classList.remove('text-orange-600');
            aboutCount.parentElement.classList.add('text-gray-500');
        }
    });
}

// Enable submit button when pledge is checked
const pledgeCheckbox = document.getElementById('pledge-checkbox');
const submitBtn = document.getElementById('submit-btn');
if (pledgeCheckbox && submitBtn) {
    pledgeCheckbox.addEventListener('change', () => {
        submitBtn.disabled = !pledgeCheckbox.checked;
    });
}

// Image upload handlers
function handleImageUpload(inputId, dataId, previewId, options = {}) {
    const input = document.getElementById(inputId);
    const dataField = document.getElementById(dataId);
    const preview = document.getElementById(previewId);
    const errorEl = options.errorId ? document.getElementById(options.errorId) : null;

    if (!input || !dataField || !preview) return;

    const showError = (msg) => {
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        } else {
            alert(msg);
        }
    };

    const clearError = () => {
        if (errorEl) {
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
        }
    };

    input.addEventListener('change', (e) => {
        clearError();
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.match('image.*')) {
            showError('Please upload an image file');
            input.value = '';
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('Image must be under 5MB');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            // Validate dimensions if required
            if (options.requireSquare || options.requireWide) {
                const img = new Image();
                img.onload = () => {
                    if (options.requireSquare && Math.abs(img.width - img.height) > 10) { // Allow small tolerance
                        showError('Please upload a square photo (width and height must be equal).');
                        input.value = '';
                        dataField.value = '';
                        preview.classList.add('hidden');
                        if (options.extraPreviewId) {
                            const extraPreview = document.getElementById(options.extraPreviewId);
                            if (extraPreview) extraPreview.classList.add('hidden');
                        }
                    } else if (options.requireWide && img.width < img.height + 100) {
                        showError('Please upload a landscape image (width must be at least 100px greater than height).');
                        input.value = '';
                        dataField.value = '';
                        preview.classList.add('hidden');
                        if (options.extraPreviewId) {
                            const extraPreview = document.getElementById(options.extraPreviewId);
                            if (extraPreview) extraPreview.classList.add('hidden');
                        }
                    } else {
                        // Success
                        dataField.value = event.target.result;
                        const previewImg = preview.querySelector('img');
                        if (previewImg) {
                            previewImg.src = event.target.result;
                            previewImg.classList.remove('hidden');
                        }
                        preview.classList.remove('hidden');

                        // Handle Extra Preview
                        if (options.extraPreviewId) {
                            const extraImg = document.getElementById(options.extraPreviewId);
                            if (extraImg) {
                                extraImg.src = event.target.result;
                                extraImg.classList.remove('hidden');
                            }
                        }
                    }
                };
                img.src = event.target.result;
            } else {
                // No dimension check
                dataField.value = event.target.result;
                const previewImg = preview.querySelector('img');
                if (previewImg) {
                    previewImg.src = event.target.result;
                    previewImg.classList.remove('hidden');
                }
                preview.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(file);
    });
}

handleImageUpload('avatar-upload', 'avatar-data', 'avatar-preview', { requireSquare: true, errorId: 'avatar-error', extraPreviewId: 'preview-image' });
handleImageUpload('title-upload', 'title-data', 'title-preview', { requireWide: true, errorId: 'title-error' });

// Tag Manager Logic
const tagEntry = document.getElementById('tag-entry');
const tagsList = document.getElementById('tags-list');
let currentTags = [];

function renderTags() {
    if (!tagsList) return;
    tagsList.innerHTML = '';
    currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'bg-primary/10 text-primary rounded text-sm flex items-center group border border-transparent hover:border-primary/30 transition-colors overflow-hidden';
        tagEl.innerHTML = `
      <span class="cursor-pointer px-2 py-1 hover:bg-primary/5 transition-colors" onclick="editTag(${index})" title="Click to edit">${tag}</span>
      <span class="text-primary/20 select-none py-0.5">|</span>
      <button type="button" class="text-primary/50 hover:text-red-500 hover:bg-red-500/10 focus:outline-none px-2 py-1 transition-colors" onclick="removeTag(${index})" title="Remove tag">
        &times;
      </button>
    `;
        tagsList.appendChild(tagEl);
    });
}

window.removeTag = (index) => {
    currentTags.splice(index, 1);
    renderTags();
};

window.editTag = (index) => {
    const tagToEdit = currentTags[index];
    currentTags.splice(index, 1);
    renderTags();
    if (tagEntry) {
        tagEntry.value = tagToEdit;
        tagEntry.focus();
    }
};

function addCurrentTag() {
    if (!tagEntry) return;
    const val = tagEntry.value.trim();
    if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        tagEntry.value = '';
        renderTags();
    } else if (currentTags.includes(val)) {
        tagEntry.value = ''; // Clear duplicate attempt
    }
}

if (tagEntry) {
    tagEntry.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCurrentTag();
        }
        if (e.key === 'Backspace' && !tagEntry.value && currentTags.length > 0) {
            currentTags.pop();
            renderTags();
        }
    });

    tagEntry.addEventListener('blur', addCurrentTag);
}

// Form submission
const form = document.getElementById('candidate-form');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Disable submit button and show spinner
        if (submitBtn) submitBtn.disabled = true;
        const submitText = document.getElementById('submit-text');
        const submitSpinner = document.getElementById('submit-spinner');
        if (submitText) submitText.classList.add('hidden');
        if (submitSpinner) submitSpinner.classList.remove('hidden');

        // Hide previous messages
        if (successMessage) successMessage.classList.add('hidden');
        if (errorMessage) errorMessage.classList.add('hidden');

        try {
            // Get Turnstile token
            const turnstileToken = turnstile.getResponse();
            if (!turnstileToken) {
                throw new Error('Please complete the security check');
            }

            // Build categories array
            const category = document.getElementById('category').value;
            const state = document.getElementById('state').value;
            const categories = [category, state];

            // Build tags array
            const tags = currentTags;
            if (tags.length === 0) {
                throw new Error('Please add at least one location tag');
            }

            // Build payload
            const payload = {
                candidate: document.getElementById('candidate-name').value,
                title: document.getElementById('position-title').value,
                party: document.getElementById('party').value,
                election_date: document.getElementById('election-date').value,
                categories: categories,
                tags: tags,
                about: document.getElementById('about').value,
                content: easyMDE.value(),
                avatarImage: document.getElementById('avatar-data').value,
                titleImage: document.getElementById('title-data').value || undefined,
                contactEmail: document.getElementById('contact-email').value,
                contactPhone: document.getElementById('contact-phone').value || undefined,
                contactNotes: document.getElementById('contact-notes').value || undefined,
                turnstileToken: turnstileToken
            };

            // Submit to Azure Function
            const response = await fetch('https://democracycandidate-prod-funcccd8ebf4.azurewebsites.net/api/submitCandidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                // Show success message
                document.getElementById('pr-link').href = result.pullRequestUrl;
                document.getElementById('pr-link').textContent = result.pullRequestUrl;
                document.getElementById('correlation-id').textContent = result.correlationId;
                if (successMessage) {
                    successMessage.classList.remove('hidden');
                    successMessage.scrollIntoView({ behavior: 'smooth' });
                }

                // Reset form
                form.reset();
                currentTags = [];
                renderTags();
                easyMDE.value('');
                document.getElementById('avatar-preview').classList.add('hidden');
                document.getElementById('title-preview').classList.add('hidden');
                turnstile.reset();

            } else {
                throw new Error(result.message || 'Submission failed');
            }

        } catch (error) {
            // Show error message
            document.getElementById('error-text').textContent = error.message;

            // Show error details if available
            const errorList = document.getElementById('error-list');
            errorList.innerHTML = '';
            if (error.errors && Array.isArray(error.errors)) {
                error.errors.forEach(err => {
                    const li = document.createElement('li');
                    li.textContent = err;
                    errorList.appendChild(li);
                });
            }

            if (errorMessage) {
                errorMessage.classList.remove('hidden');
                errorMessage.scrollIntoView({ behavior: 'smooth' });
            }

            // Reset Turnstile
            turnstile.reset();

        } finally {
            // Re-enable submit button
            if (submitBtn) submitBtn.disabled = false;
            if (submitText) submitText.classList.remove('hidden');
            if (submitSpinner) submitSpinner.classList.add('hidden');
        }
    });
}
