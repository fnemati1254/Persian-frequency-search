Persian Lexical Characteristics Database (https://fnemati1254.github.io/Persian-frequency-search/)

پایگاه دادهٔ ویژگی‌های واژگانی زبان فارسی

معرفی

این ابزار (https://fnemati1254.github.io/Persian-frequency-search) یک پایگاه داده و رابط جست‌وجوی تعاملی برای ویژگی‌های واژگانی زبان فارسی است. این ویژگی‌ها شامل خوشایندی (Valence)، هیجان‌انگیختگی (Arousal)، سلطه (Dominance)، عینیت/ملموس‌بودگی (Concreteness) و شاخص‌های مبتنی بر بسامد (مانند Zipf) می‌شوند.
تمام پردازش‌ها به‌صورت کاملاً محلی (client-side) انجام می‌شود و هیچ داده‌ای به سرور ارسال نمی‌گردد.

داده‌های احساسی و عینیت (VAD & Concreteness)

مقادیر خوشایندی، هیجان، سلطه و عینیت بر اساس مقاله‌ی پذیرفته‌شده در Behavior Research Methods (2026) با عنوان زیر ارائه شده‌اند:

Extrapolated Persian Lexical Affect Norms (E-PLAN): From Best–Worst Judgments of Valence, Arousal, Dominance, and Concreteness

برای هر واژه:

اگر قضاوت انسانی موجود باشد، همان مقدار گزارش می‌شود.

اگر قضاوت انسانی وجود نداشته باشد، مقدار پیش‌بینی‌شده (Predicted) مبتنی بر مدل‌سازی محاسباتی ارائه می‌شود.

در خروجی، ستون Affect_Source به‌صورت شفاف مشخص می‌کند که مقدار هر واژه Human یا Predicted است.

بسامد و ویژگی‌های مبتنی بر پیکره

شاخص‌های بسامدی (از جمله Zipf) بر اساس پیکره‌ی وب فارسی CC-100 (نسخه‌ی پاک‌سازی‌شده) محاسبه شده‌اند. همچنین ماتریس‌های word2vec در مقاله Nemati et al. (2026) نیز از همین پیکره استخراج شده‌اند.

قابلیت‌ها

جست‌وجوی واژه به‌صورت زنده با پشتیبانی از:

فاصله، نیم‌فاصله و حالت‌های نوشتاری مختلف

تحلیل فهرست واژه‌ها یا فایل متنی UTF-8

انتخاب پویا‌ی ویژگی‌های واژگانی برای نمایش

خروجی CSV
مناسب برای پژوهش‌های روان‌شناسی، روان‌شناسی زبان، علوم شناختی، زبان‌شناسی محاسباتی و آموزش زبان

Overview

This project (https://fnemati1254.github.io/Persian-frequency-search/) provides a searchable database and interactive web interface for Persian lexical characteristics, including Valence, Arousal, Dominance, Concreteness, and frequency-based measures (e.g., Zipf).
All computations are performed entirely client-side, and no user data are transmitted or stored.
Affective and Concreteness Ratings (VAD & Concreteness)
The affective and concreteness values are based on the paper accepted in Behavior Research Methods (2026) entitled:
Extrapolated Persian Lexical Affect Norms (E-PLAN): From Best–Worst Judgments of Valence, Arousal, Dominance, and Concreteness
For each word:
Human ratings are reported when available.
When human ratings do not exist, machine-predicted (Predicted) values are provided.
The column Affect_Source explicitly indicates whether each value is Human or Predicted.
Frequency-Based Lexical Characteristics
Frequency-related measures (including Zipf values) are derived from the cleaned CC-100 Persian Web Corpus. Word2vec embeddings were also trained on this corpus.
Features
Real-time word search with robust Persian normalization (space / half-space variants)
Batch analysis of word lists or UTF-8 text files
User-selectable lexical characteristics
Excel-ready CSV export
Designed for psycholinguistic, cognitive, computational linguistics, and educational research
References
Conneau, A., Khandelwal, K., Goyal, N., Chaudhary, V., Wenzek, G., Guzmán, F., … Stoyanov, V. (2020).Unsupervised cross-lingual representation learning at scale. Proceedings of the 58th Annual Meeting of the Association for Computational Linguistics (ACL). https://doi.org/10.18653/v1/2020.acl-main.747
Wenzek, G., Lachaux, M. A., Conneau, A., Chaudhary, V., Guzmán, F., Joulin, A., & Grave, É. (2020). CCNet: Extracting high quality monolingual datasets from web crawl data. Proceedings of the 12th Language Resources and Evaluation Conference (LREC), 4003–4012.
Nemati, F., Westbury, C., Rostami, H., & Alavi, F. (2026). Extrapolated Persian Lexical Affect Norms (E-PLAN): From best–worst judgments of valence, arousal,


