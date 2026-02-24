// Custom Image Manager for inline EasyMDE support
const ImageManager = {
    // Map shortId -> { blobUrl, base64, filename }
    store: new Map(),

    // Generate random short ID
    generateId: () => 'img-' + Math.random().toString(36).substr(2, 9),

    // Add image to store and return short ID
    add: (file, blobUrl, base64) => {
        const id = ImageManager.generateId();
        // slugify filename roughly
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '-').toLowerCase();
        ImageManager.store.set(id, {
            blobUrl,
            base64,
            filename: `images/${id}-${safeName}`
        });
        return id;
    },

    // Process file: resize -> compress -> store
    process: async (file) => {
        if (!file.type.startsWith('image/')) throw new Error('Not an image file');
        if (file.size > 10 * 1024 * 1024) throw new Error('Image too large (max 10MB)');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // SVG files: preserve as-is, no canvas processing
                // Check both MIME type and file extension
                const isSVG = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                if (isSVG) {
                    const base64 = e.target.result; // Already a data URL
                    const id = ImageManager.add(file, base64, base64); // Use same for both preview and submission
                    resolve({ id, filename: file.name });
                    return;
                }

                // Raster images: compress via canvas
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Max dimensions
                    const MAX_WIDTH = 1000;
                    const MAX_HEIGHT = 1000;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG 80%
                    const base64 = canvas.toDataURL('image/jpeg', 0.8);

                    // Create Blob for local preview URL (better performance than base64 in src)
                    canvas.toBlob((blob) => {
                        const blobUrl = URL.createObjectURL(blob);
                        const id = ImageManager.add(file, blobUrl, base64);
                        resolve({ id, filename: file.name });
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};

// Helper to Title Case strings
const toTitleCase = (str) => {
    return str.replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
};

// Helper to normalize Party names
const formatParty = (party) => {
    if (!party) return '';
    const p = party.trim().toLowerCase();

    // Exact short codes
    if (['d', 'dem'].includes(p)) return 'Democrat';
    if (['r', 'rep', 'gop'].includes(p)) return 'Republican';
    if (['i', 'ind'].includes(p)) return 'Independent';
    if (['l', 'lib'].includes(p)) return 'Libertarian';
    if (['g', 'green'].includes(p)) return 'Green';

    // Check startsWith for longer variants (e.g. "democrats" -> "Democrat")
    if (p.startsWith('democrat')) return 'Democrat';
    if (p.startsWith('republican')) return 'Republican';
    if (p.startsWith('libertarian')) return 'Libertarian';

    return toTitleCase(party);
};

// Helper to format tags (City, ST)
const formatTag = (tag) => {
    if (!tag) return '';

    // Split by comma
    const parts = tag.split(',').map(s => s.trim());

    // Check for City, ST pattern (last part is exactly 2 chars)
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (lastPart.length === 2) {
            // Uppercase the state abbreviation
            parts[parts.length - 1] = lastPart.toUpperCase();

            // Title case the rest
            for (let i = 0; i < parts.length - 1; i++) {
                parts[i] = toTitleCase(parts[i]);
            }
            return parts.join(', ');
        }
    }

    // Default title case
    return toTitleCase(tag);
};

// Initialize EasyMDE with custom image handling
const easyMDE = new EasyMDE({
    element: document.getElementById('content-editor'),
    placeholder: 'Write your biography here... (Drag & Drop images supported!)',
    spellChecker: true,
    autosave: {
        enabled: true,
        uniqueId: 'candidate-submission',
        delay: 5000,
    },
    // Prevent side-by-side from taking over full window
    sideBySideFullscreen: false,

    // Custom renderer to resolve image:id to blob:url for preview
    previewRender: (plainText) => {
        // PRE-PROCESS: Replace image:id with blob:url for preview
        const imageRegex = /!\[(.*?)\]\(image:([a-z0-9-]+)\)/g;
        const processedText = plainText.replace(imageRegex, (match, alt, id) => {
            const imgData = ImageManager.store.get(id);
            if (imgData) {
                return `![${alt}](${imgData.blobUrl})`;
            }
            return match; // Keep original if not found
        });

        // If marked is not available (e.g. error loading), fallback to plain text
        if (typeof marked === 'undefined') {
            return processedText;
        }

        return marked.parse(processedText);
    },

    toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link',
        {
            name: "image-upload",
            action: (editor) => {
                document.getElementById('hidden-image-input').click();
            },
            className: "fa fa-picture-o",
            title: "Upload Image",
        },
        '|',
        'preview', 'side-by-side', 'fullscreen', '|', 'guide'
    ],
    initialValue: `### Policy

[Describe your policy positions and what you stand for]

### Experience

[Share your relevant experience and qualifications]

### Endorsements

[Explain how you work with others and build consensus]`
});

// Hidden file input for toolbar button
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.id = 'hidden-image-input';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
        try {
            const { id } = await ImageManager.process(e.target.files[0]);
            const cm = easyMDE.codemirror;
            const doc = cm.getDoc();
            const cursor = doc.getCursor();
            doc.replaceRange(`![Image](image:${id})`, cursor);
        } catch (err) {
            console.error(err);
            alert('Failed to upload image: ' + err.message);
        }
        // Clear value so same file can be selected again
        fileInput.value = '';
    }
});

// Drag & Drop + Paste Handlers
const cm = easyMDE.codemirror;

cm.on('drop', async (cm, e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
        e.preventDefault();
        const { id } = await ImageManager.process(files[0]);
        // Insert at drop position (handled by codemirror via coords if complex, 
        // but simpler to just insert at cursor or prevent default drop behavior and insert manually)
        // Actually, CodeMirror's default drop might try to insert the file path or just text.
        // We want to insert the markdown.

        // Calculate position from mouse coords
        const coords = cm.coordsChar({ left: e.pageX, top: e.pageY });
        cm.getDoc().replaceRange(`![Image](image:${id})`, coords);
    }
});

cm.on('paste', async (cm, e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            const { id } = await ImageManager.process(file);
            const doc = cm.getDoc();
            doc.replaceRange(`![Image](image:${id})`, doc.getCursor());
            return; // Handle one image per paste for now
        }
    }
});

// Default to side-by-side view for better user experience
// Use setTimeout to ensure DOM is ready and layout is calculated
setTimeout(() => {
    if (!easyMDE.isSideBySideActive()) {
        easyMDE.toggleSideBySide();
    }
}, 200);

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

    // Website Validation
    const formWebsiteInput = document.getElementById('website');
    if (formWebsiteInput && formWebsiteInput.value.trim()) {
        let val = formWebsiteInput.value.trim();
        if (!/^https?:\/\//i.test(val)) {
            val = 'https://' + val;
            formWebsiteInput.value = val;
        }
        if (!/^https:\/\//i.test(val)) {
            errors.push("Campaign website must use a secure https:// link.");
        } else {
            try {
                new URL(val);
            } catch (_) {
                errors.push("Please enter a valid campaign website URL.");
            }
        }
    }

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

// Website Validation
const websiteInput = document.getElementById('website');
const websiteError = document.getElementById('website-error');

if (websiteInput) {
    const validateWebsite = () => {
        let value = websiteInput.value.trim();
        
        if (!value) {
            if (websiteError) {
                websiteError.classList.add('hidden');
                websiteError.textContent = '';
            }
            websiteInput.classList.remove("!border-red-600");
            return true;
        }

        // Auto-fix missing protocol
        if (!/^https?:\/\//i.test(value)) {
            value = 'https://' + value;
            websiteInput.value = value;
        }

        // Must be https
        if (!/^https:\/\//i.test(value)) {
             if (websiteError) {
                 websiteError.textContent = "Website must use a secure https:// link.";
                 websiteError.classList.remove('hidden');
             }
             websiteInput.classList.add("!border-red-600");
             return false;
        }

        // Basic URL validation
        try {
            new URL(value);
            if (websiteError) {
                websiteError.classList.add('hidden');
                websiteError.textContent = '';
            }
            websiteInput.classList.remove("!border-red-600");
            return true;
        } catch (_) {
            if (websiteError) {
                websiteError.textContent = "Please enter a valid website URL.";
                websiteError.classList.remove('hidden');
            }
            websiteInput.classList.add("!border-red-600");
            return false;
        }
    };

    websiteInput.addEventListener('blur', validateWebsite);
    websiteInput.addEventListener('input', () => {
        if (websiteError) websiteError.classList.add('hidden');
        websiteInput.classList.remove("!border-red-600");
    });
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



// Auto-formatting on Blur
const candidateNameInput = document.getElementById('candidate-name');
const positionTitleInput = document.getElementById('position-title');
const partyInput = document.getElementById('party');
// Tag entry is already handled by addCurrentTag which we will update

if (candidateNameInput) {
    candidateNameInput.addEventListener('blur', () => {
        candidateNameInput.value = toTitleCase(candidateNameInput.value);
    });
}
if (positionTitleInput) {
    positionTitleInput.addEventListener('blur', () => {
        positionTitleInput.value = toTitleCase(positionTitleInput.value);
    });
}
if (partyInput) {
    partyInput.addEventListener('blur', () => {
        partyInput.value = formatParty(partyInput.value);
    });
}

function addCurrentTag() {
    if (!tagEntry) return;
    let val = tagEntry.value.trim(); // Changed to let so we can modify it

    if (val) {
        val = formatTag(val); // Format BEFORE checking duplicates
    }

    if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        tagEntry.value = '';
        renderTags();
    } else if (currentTags.includes(val)) {
        tagEntry.value = ''; // Clear duplicate attempt
    }
}

// Form submission
const form = document.getElementById('candidate-form');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');
const submitBtn = document.getElementById('submit-btn');

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
            // Build payload

            // 1. Process Markdown Content for Images
            let finalContent = easyMDE.value();
            const additionalImages = [];

            // Regex to find ![alt](image:shortId)
            const imageRegex = /!\[(.*?)\]\(image:([a-z0-9-]+)\)/g;
            let match;

            // We need to replace synchronously or careful with regex loop
            // Let's iterate and build replacements first
            const replacements = [];
            while ((match = imageRegex.exec(finalContent)) !== null) {
                const [fullMatch, altText, id] = match;
                const imgData = ImageManager.store.get(id);

                if (imgData) {
                    // Use the safe filename we generated earlier
                    const targetPath = imgData.filename;
                    replacements.push({
                        fullMatch,
                        newText: `![${altText}](${targetPath})`,
                        imageData: {
                            path: targetPath, // e.g. "images/img-xyz-photo.jpg". Backend handles placement relative to candidate folder.
                            content: imgData.base64.split(',')[1] // Remove data:image/jpeg;base64, prefix
                        }
                    });
                }
            }

            // Apply replacements
            replacements.forEach(rep => {
                finalContent = finalContent.replace(rep.fullMatch, rep.newText);
                additionalImages.push(rep.imageData);
            });

            // Format Tags
            const formattedTags = tags.map(t => formatTag(t));

            // Format Categories (same logic as tags for now or just Title Case)
            // Categories are [Category, State]. State is usually 2 letter uppercase or full name.
            // If we assume categories are simple Title Case:
            const formattedCategories = categories.map(c => toTitleCase(c));

            const payload = {
                candidate: toTitleCase(document.getElementById('candidate-name').value),
                title: toTitleCase(document.getElementById('position-title').value),
                party: formatParty(document.getElementById('party').value),
                electionDate: document.getElementById('election-date').value,
                website: document.getElementById('website').value.trim() || undefined,
                categories: formattedCategories,
                tags: formattedTags,
                about: document.getElementById('about').value,
                content: finalContent,
                additionalImages: additionalImages,
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
            const apiUrl = window.CANDIDATE_FORM_CONFIG?.apiUrl || 'https://democracycandidate-prod-funcccd8ebf4.azurewebsites.net/api/submitCandidate';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                // Redirect to success page
                // Use replace() so back button doesn't resubmit
                const successUrl = `/running/success/?pr=${encodeURIComponent(result.pullRequestUrl)}&cid=${encodeURIComponent(result.correlationId || '')}`;
                window.location.replace(successUrl);
                return;
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
