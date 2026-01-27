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
// Validation Summary Logic
const validationSummary = document.getElementById('validation-summary');
const validationList = document.getElementById('validation-list');

const showErrorSummary = (errors) => {
    if (!validationSummary || !validationList) return;

    validationList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
    validationSummary.classList.remove('hidden');

    // Scroll to summary
    validationSummary.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const hideErrorSummary = () => {
    if (validationSummary) validationSummary.classList.add('hidden');
};

// Validate Form Function
const validateForm = () => {
    const errors = [];

    // 1. Pledge Check
    const pledgeCheckbox = document.getElementById('pledge-checkbox');
    if (pledgeCheckbox && !pledgeCheckbox.checked) {
        errors.push("You must agree to the pro-democracy pledge.");
    }

    // 2. Required Fields check (Basic HTML5 validation check)
    const requiredInputs = document.querySelectorAll('input[required], select[required], textarea[required]');
    requiredInputs.forEach(input => {
        if (!input.checkValidity()) {
            // Get label text for better error message
            const label = document.querySelector(`label[for="${input.id}"]`);
            const fieldName = label ? label.innerText.replace('*', '').trim() : input.name || input.id;
            errors.push(`${fieldName} is required.`);
        }
    });

    // 3. Custom Validations

    // Email Regex
    const emailInput = document.getElementById('contact-email');
    if (emailInput && emailInput.value) {
        if (!/^[a-zA-Z0-9].*@.*\..+$/.test(emailInput.value.trim())) {
            // Avoid duplicate if it's trapped by required check, but required only checks empty
            // logic: if value exists but invalid format
            errors.push("Please enter a valid email address.");
        }
    }

    // Tags
    if (currentTags.length === 0) {
        errors.push("Please add at least one location tag.");
    }

    // Images (Check generated data fields)
    const avatarData = document.getElementById('avatar-data');
    if (avatarData && !avatarData.value) {
        // This might be caught by required on file input if users haven't selected anything, 
        // but let's be safe as file input value might be cleared if invalid.
        // Actually, the file input has 'required', so standard check catches it.
        // But let's double check if we cleared it programmatically.
        const avatarInput = document.getElementById('avatar-upload');
        if (avatarInput && !avatarInput.value) {
            // Already caught by required loop above if logic holds
        } else if (!avatarData.value) {
            errors.push("Main Photo must be a valid image under 5MB.");
        }
    }

    return errors;
};


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

// Initialize Phone Input
const phoneInputField = document.getElementById("contact-phone");
const phoneError = document.getElementById("phone-error");
let phoneInput = null;

if (phoneInputField) {
    phoneInput = window.intlTelInput(phoneInputField, {
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/25.10.1/build/js/utils.min.js",
        initialCountry: "us",
        separateDialCode: true,
        nationalMode: true,
    });

    const resetPhoneError = () => {
        if (phoneError) {
            phoneError.classList.add('hidden');
            phoneError.textContent = '';
        }
        phoneInputField.classList.remove("!border-red-600");
    };

    const validatePhone = () => {
        resetPhoneError();
        const value = phoneInputField.value.trim();
        if (value) {
            // 1. Attempt to get number from library
            let currentNumber = phoneInput.getNumber();

            // 2. Fallback for US numbers if library returns empty (due to validation strictness or other issues)
            // This ensures 10-digit inputs are always formatted
            if (!currentNumber && phoneInput.getSelectedCountryData().iso2 === 'us') {
                const raw = value.replace(/\D/g, '');
                if (raw.length === 10) {
                    currentNumber = '+1' + raw;
                    // Manual visual formatting
                    const formatted = `(${raw.substring(0, 3)}) ${raw.substring(3, 6)}-${raw.substring(6, 10)}`;
                    phoneInputField.value = formatted;
                    // We consider this valid for our purposes if it was 10 digits
                    return true;
                }
            }

            // 3. Apply format if we have a valid E.164 string (and didn't manually format above)
            if (currentNumber && phoneInput.getSelectedCountryData().iso2 !== 'us') {
                phoneInput.setNumber(currentNumber);
            }

            // 4. Validate (allow empty as it is optional, but if value exists check validity)
            // We re-fetch validity after setNumber which might have fixed things
            if (!phoneInput.isValidNumber()) {
                // If we manually formatted a US number, we trust it. 
                // We check if value looks like our manual format
                if (phoneInput.getSelectedCountryData().iso2 === 'us') {
                    const raw = phoneInputField.value.replace(/\D/g, '');
                    if (raw.length === 10) return true;
                }

                const errorCode = phoneInput.getValidationError();
                let msg = "Invalid phone number format";
                // Basic error mapping
                switch (errorCode) {
                    case 1: msg = "Invalid country code"; break;
                    case 2: msg = "Phone number is too short"; break;
                    case 3: msg = "Phone number is too long"; break;
                    case 4: msg = "Invalid phone number"; break;
                }

                if (phoneError) {
                    phoneError.textContent = msg;
                    phoneError.classList.remove('hidden');
                }
                phoneInputField.classList.add("!border-red-600");
                return false;
            }
        }
        return true;
    };

    phoneInputField.addEventListener('blur', validatePhone);
    phoneInputField.addEventListener('input', resetPhoneError);
}

// Email Validation
const emailInput = document.getElementById('contact-email');
const emailError = document.getElementById('email-error');

if (emailInput) {
    const validateEmail = () => {
        const value = emailInput.value.trim();
        // Regex: At least one alphanumeric char at start, contains @, contains . after @
        // This is a "honest mistake" checker, not an RFC 5322 validator
        const valid = /^[a-zA-Z0-9].*@.*\..+$/.test(value);

        if (value && !valid) {
            if (emailError) {
                emailError.textContent = "Please enter a valid email address (e.g. name@example.com)";
                emailError.classList.remove('hidden');
            }
            emailInput.classList.add("!border-red-600");
            return false;
        } else {
            if (emailError) {
                emailError.classList.add('hidden');
                emailError.textContent = '';
            }
            emailInput.classList.remove("!border-red-600");
            return true;
        }
    };

    emailInput.addEventListener('blur', validateEmail);
    emailInput.addEventListener('input', () => {
        // Clear error on input but don't validate until blur (less annoying)
        if (emailError) emailError.classList.add('hidden');
        emailInput.classList.remove("!border-red-600");
    });
}
// Tag Manager Logic
const tagEntry = document.getElementById('tag-entry');
const tagsList = document.getElementById('tags-list');
let currentTags = [];

function renderTags() {
    if (!tagsList) return;
    tagsList.innerHTML = '';
    currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'bg-primary/10 text-primary dark:bg-blue-900/40 dark:text-blue-400 rounded text-sm flex items-center group border border-transparent hover:border-primary/30 dark:hover:border-blue-500 transition-colors overflow-hidden';
        tagEl.innerHTML = `
      <span class="cursor-pointer px-2 py-1 hover:bg-primary/5 dark:hover:bg-white/5 transition-colors" onclick="editTag(${index})" title="Click to edit">${tag}</span>
      <span class="text-primary/20 dark:text-blue-400/30 select-none py-0.5">|</span>
      <button type="button" class="text-primary/50 dark:text-blue-400/60 hover:text-red-500 hover:bg-red-500/10 focus:outline-none px-2 py-1 transition-colors" onclick="removeTag(${index})" title="Remove tag">
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

        // 1. Validate Form
        const errors = validateForm();
        if (errors.length > 0) {
            showErrorSummary(errors);
            return;
        }

        // Hide validation summary if valid
        hideErrorSummary();

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
                // If token expired or not completed, treat as form error?
                // Or just throw to catch block. 
                // Let's add it to validation summary context if we want, or just let the catch handle it.
                // The catch block puts it in 'error-text' div, which is different from validation summary.
                // To be consistent, maybe just throw here and let the catch block handle server/system errors.
                throw new Error('Please complete the security check');
            }

            // Build categories array
            const category = document.getElementById('category').value;
            const state = document.getElementById('state').value;
            const categories = [category, state];

            // Build tags array
            const tags = currentTags;
            // Tag validation is already done in validateForm(), so we proceed.

            // Email regex validation is already done in validateForm(), so we proceed.

            // Build payload
            const payload = {
                candidate: document.getElementById('candidate-name').value,
                title: document.getElementById('position-title').value,
                party: document.getElementById('party').value,
                electionDate: document.getElementById('election-date').value,
                categories: categories,
                tags: tags,
                about: document.getElementById('about').value,
                content: easyMDE.value(),
                avatarImage: document.getElementById('avatar-data').value,
                titleImage: document.getElementById('title-data').value || undefined,
                contactEmail: document.getElementById('contact-email').value,
                contactPhone: (() => {
                    if (phoneInput && phoneInput.isValidNumber()) {
                        return phoneInput.getNumber();
                    }
                    // Fallback manual parsing for US numbers
                    const rawVal = document.getElementById("contact-phone").value || "";
                    const country = phoneInput ? phoneInput.getSelectedCountryData().iso2 : "";
                    if (country === 'us') {
                        const digits = rawVal.replace(/\D/g, '');
                        if (digits.length === 10) return "+1" + digits;
                    }
                    return rawVal || undefined;
                })(),
                contactNotes: document.getElementById('contact-notes').value || undefined,
                submitterName: document.getElementById('submitter-name').value || undefined,
                submitterRelationship: document.getElementById('submitter-relationship').value || undefined,
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
