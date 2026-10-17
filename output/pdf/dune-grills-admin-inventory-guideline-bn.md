<!-- Editable source. Dune & Grills; version 1.0; 2026-10-17; Asia/Riyadh; code 2f854d5. -->

# ০১ | বইটি কীভাবে ব্যবহার করবেন

এই নির্দেশিকা Dune & Grills-এর `/admin` ও `/inventory` অংশের জন্য। Admin থেকে আসা POS, Kitchen, Recipe Instructions, Rider Portal ও Tips & Tricks লিংকের কাজও সংক্ষেপে বোঝানো হয়েছে। বাইরের এই ওয়ার্কস্পেসগুলোর পূর্ণ নির্দেশিকা এই বইয়ের আওতা নয়।

## পড়ার সহজ ক্রম
১. নতুন ব্যবহারকারী আগে প্রবেশাধিকার, প্রস্তুতি ও কাজের মানচিত্র পড়ুন।
২. এরপর নিজের দায়িত্বের ফিচার দেখুন। প্রতিটি অধ্যায়ে কোথায় যাবেন, কী করবেন, ফলাফল ও নিয়ম দেওয়া আছে।
৩. সমস্যা হলে শেষের সমস্যা সমাধান, প্রশ্নোত্তর ও শব্দার্থ ব্যবহার করুন।

## লেখার চিহ্ন
**সিস্টেমের নিয়ম:** বর্তমান কোডে কার্যকর বাধ্যবাধকতা। **পরামর্শ:** কাজ ভালোভাবে করার অভ্যাস; এটি আলাদা সফটওয়্যার বাধা নয়। **বর্তমান সীমাবদ্ধতা:** পর্যালোচিত কোডে পাওয়া সমস্যা বা অসম্পূর্ণ সুবিধা।

## যাচাইয়ের ভিত্তি
১৭ অক্টোবর ২০২৬ তারিখে স্থানীয় পেজ, ফর্ম, route, permission, controller, service, model এবং প্রকল্পের নথি মিলিয়ে বইটি লেখা হয়েছে। কোড সংস্করণ `2f854d5`। লাইভ অ্যাকাউন্টে লগইন, লেনদেন বা ডেটাবেজ পরীক্ষা করা হয়নি। কোনো স্ক্রিনশটকে বাস্তব সিস্টেমের ছবি হিসেবে উপস্থাপন করা হয়নি।

> এই বইয়ের সব নাম, পরিমাণ, দাম ও ID নমুনা। বর্তমান পর্দা বা নিয়ম ভবিষ্যতে বদলালে বইটিও হালনাগাদ করতে হবে।

# ০২ | কে কোন কাজ করতে পারবেন

একই মেনু সবার জন্য দেখা যায় না। পেজে প্রবেশ এবং একটি কাজ সংরক্ষণের অনুমতি আলাদাভাবে যাচাই হয়।

| ভূমিকা | প্রধান কাজ ও সীমা |
| --- | --- |
| Admin | সব প্রশাসনিক কাজ; Staff ও Attendance পরিবর্তন; উচ্চমূল্যের ক্রয় অনুমোদন; Rider সক্রিয় করা। |
| Manager | Dashboard, Orders, catalog, settings, POS ও inventory পরিচালনা; Staff ও Attendance দেখা; operating expense দেখা। |
| Cashier | POS, Quick Delivery Order ও সীমিত Deliveries cash workflow; সম্পূর্ণ Admin Dashboard নয়। |
| Inventory / Storekeeper | Inventory দেখা ও সম্পাদনা, ক্রয় খসড়া/মাল গ্রহণ, recipe, waste, count জমা, reorder review। |
| Accountant | Finance দেখা/লেখা; invoice ও payment-এর কিছু API অনুমতি; নিচের প্রবেশ-সীমাবদ্ধতা প্রযোজ্য। |
| Kitchen / Rider | নিজ নিজ Kitchen বা Rider workspace; Admin Dashboard নয়। |

## বিশেষ পার্থক্য
Manager Staff account, attendance correction, shift template ও leave পরিবর্তন করতে পারেন না। Operating expense তৈরি/পরিবর্তন করেন Admin ও Accountant; Manager এখানে শুধু দেখেন। Inventory count অনুমোদন, PO অনুমোদন ও invoice অনুমোদন করেন Admin/Manager।

> বর্তমান সীমাবদ্ধতা: Accountant-এর inventory ও payables API অনুমতি আছে, কিন্তু `/inventory` layout কেবল Admin, Manager, Inventory ও Storekeeper-কে ঢুকতে দেয়। ফলে Accountant-এর invoice পেজে কাজ করার সুযোগ বর্তমানে নিশ্চিত নয়। Admin/Manager-এর সহায়তা নিন; API অনুমতিকে পেজে প্রবেশের প্রমাণ ধরে নেবেন না।

# ০৩ | প্রবেশ, প্রস্তুতি ও কাজের মানচিত্র

## শুরু করার ধাপ
১. `/login` থেকে নিজের অনুমোদিত অ্যাকাউন্টে প্রবেশ করুন।
২. Admin/Manager হলে `/admin`; stock দায়িত্বে হলে `/inventory`; Cashier হলে `/pos` খুলুন।
৩. প্রোফাইলের নাম ও role মিলিয়ে নিন। মোবাইলে মেনু আইকন দিয়ে sidebar খুলুন।
৪. কোনো পেজে প্রবেশ না হলে role ও account active আছে কি না Admin-কে যাচাই করতে বলুন।

## প্রথমবার প্রস্তুতির ক্রম
**বিক্রয়:** Restaurant Settings → Menu Categories → Menu Items / Combos → Inventory Recipes → POS / website sale।

**গুদাম:** Inventory Categories → Suppliers → Stock Items → Purchase Orders → Receive → Batches / Stock Movements।

**সরবরাহকারীর হিসাব:** Receive → Supplier Invoice → Submit → Approve → Post → Record payment।

**স্টাফ:** Shift template → Staff account ও Attendance PIN → Staff Clock → Attendance report।

## সাধারণ ব্যবহার
Search দিয়ে খুঁজুন; filter দিয়ে তালিকা ছোট করুন; pagination দিয়ে পরের ফল দেখুন। Save-এর পর সফল বার্তা ও তৈরি রেকর্ড পরীক্ষা করুন। বন্ধ বা ধূসর বাটনের ক্ষেত্রে আগে প্রয়োজনীয় ঘর, status ও role দেখুন। Logout প্রোফাইল/সাইডবারে পাওয়া যায়।

> নেটওয়ার্ক ব্যর্থ হলে শূন্য দেখানো বা পুরোনো সংখ্যা দেখানোকে নতুন তথ্য ধরে নেবেন না। Last updated, stale, offline ও unavailable বার্তা পড়ুন।

# ০৪ | Dashboard: ব্যবসার সারসংক্ষেপ

**কোথায়:** `/admin` অথবা Dashboard। **কারা:** Admin ও Manager।

এখানে বিক্রয়, অর্ডার, সাম্প্রতিক কাজ, inventory health এবং ব্যবসার অন্যান্য সারসংক্ষেপ দেখা যায়। এটি পুরো সিস্টেমের প্রাথমিক পর্যবেক্ষণ পেজ।

## ধাপে ধাপে
১. period control থেকে প্রয়োজনীয় সময়কাল নির্বাচন করুন।
২. Net Sales, order count, তুলনা ও রিপোর্টের সংজ্ঞা পড়ুন।
৩. Recent Orders-এর status filter দিয়ে প্রয়োজনীয় অর্ডার খুলুন।
৪. inventory health থেকে সংশ্লিষ্ট stock বা batch পেজে যান।
৫. সন্দেহ হলে Refresh এবং সর্বশেষ সফল update-এর সময় দেখুন।

## কী বোঝায়
Net Sales মানে রেকর্ড করা captured sales থেকে প্রযোজ্য refund ও void বাদ দেওয়ার পরিমাণ। এটি লাভ নয়। Ordered amount-এ unpaid বা cancelled অর্ডারের মূল total-ও থাকতে পারে। Inventory health-এ physical ও saleable stock-এর পার্থক্য গুরুত্বপূর্ণ।

## নিয়ম ও ফলাফল
Dashboard দেখা কোনো PO অনুমোদন, invoice পরিশোধ বা stock adjustment করে না। সারসংক্ষেপ প্রায় ৬০ সেকেন্ডের refresh ব্যবস্থায় চলে; hidden tab, offline বা failure-এ তথ্য পুরোনো হতে পারে। পুরো request ব্যর্থ হলে পুরোনো snapshot সতর্কতা দিয়ে থাকতে পারে।

**নমুনা:** SAR 100-এর paid sale ও SAR 20-এর completed refund হলে সংশ্লিষ্ট sales cohort-এর net SAR 80; এটি SAR 80 মুনাফা হওয়ার প্রমাণ নয়।

# ০৫ | Operations, order alert ও shift summary

**কোথায়:** Dashboard-এর operations/attention অংশ ও উপরের order alert controls। **কারা:** Admin/Manager।

## কাজের ধাপ
১. দীর্ঘ সময় pending order, preparation overdue, PO approval, invoice review ও overdue payable দেখুন।
২. নির্দিষ্ট record বা View all খুলে মূল পেজে কাজ সম্পন্ন করুন।
৩. shift summary থেকে `/pos`-এর shift history খুলুন; প্রয়োজন হলে POS unlock করুন।
৪. ব্রাউজার notification চাইলে অনুমতি দিন; sound control নিজের প্রয়োজনমতো ব্যবহার করুন।

## গুরুত্বপূর্ণ নিয়ম
Operations-এর বর্তমান attention financial period থেকে স্বাধীন। গতকালের অসম্পূর্ণ কাজ আজও দেখা যেতে পারে। একই অর্ডার একাধিক attention-এ থাকতে পারে; সব count যোগ করে অনন্য অর্ডারের সংখ্যা ধরবেন না।

Pending attention-এর সীমা Settings → Preparation-এ বদলানো যায়; এতে order status বদলায় না। Overdue payable-এর ক্ষেত্রে Riyadh-এ due day শেষ হওয়ার পর বকেয়া invoice overdue হয়।

Shift summary-র expected cash-এ opening cash, cash sale, refund/void ও cash movement থাকতে পারে। Card ও aggregator prepaid-কে drawer cash ধরে নেবেন না। Closed shift-এ সংরক্ষিত closing snapshot দেখানো হয়।

**নমুনা:** SAR 100 opening cash ও SAR 50 cash sale হলে অন্য cash movement না থাকলে expected drawer SAR 150।

# ০৬ | Search ও Search by ID

**কোথায়:** Admin header-এর search এবং `/admin/record-search`।

## দুটি search-এর ব্যবহার
Admin-এর সাধারণ search দিয়ে order, customer বা menu item খুঁজুন। কমপক্ষে ২টি অক্ষর দিলে ফল আসতে শুরু করে। ফলের ধরন দেখে সঠিক বিভাগ খুলুন।

Search by ID দিয়ে readable ID, SKU, invoice number, lot বা employee reference খুঁজুন। Admin, Manager, Cashier, Inventory, Storekeeper ও Accountant এই পেজে যেতে পারেন; ফল নিজের অনুমতি অনুযায়ী সীমিত থাকে।

## ধাপে ধাপে
১. ID কপি করে search ঘরে দিন।
২. search চালিয়ে ফলের record type ও পরিচয় মিলিয়ে নিন।
৩. মূল record খোলার অনুমতি থাকলে সংশ্লিষ্ট লিংক ব্যবহার করুন।
৪. ফল না এলে বানান, prefix, অতিরিক্ত space ও historical reference পরীক্ষা করুন।

## ID-এর অর্থ
`EXP` expense, `STX` stock transaction, `RFN` refund, `PAY` supplier payment, `PSH` POS shift, `CSH` cash movement, `HLD` held sale, `CUS` customer এবং `EMP` staff চিহ্নিত করে।

> নমুনা ID: `EXP-2026-000001`। প্রকৃত ID সিস্টেম নিজে তৈরি করে; হাতে পরিবর্তন করবেন না। ক্রমিক নম্বরে ফাঁক থাকা মানেই কোনো record মুছে গেছে নয়।

# ০৭ | Orders: অর্ডার দেখা ও অগ্রগতি

**কোথায়:** `/admin?tab=orders`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. order number, customer বা phone দিয়ে খুঁজুন; date/status filter ব্যবহার করুন।
২. order details খুলে items, notes, order type, source, payment ও history দেখুন।
৩. প্রযোজ্য পরবর্তী status নির্বাচন করুন। প্রস্তুতির সময় দিলে ১-২৪০ মিনিটের পূর্ণ সংখ্যা দিন।
৪. cancellation হলে কারণ লিখুন। প্রয়োজনে visible order নির্বাচন করে bulk control ব্যবহার করুন; প্রতিটি order-এর বর্তমান অবস্থাও উপযোগী হতে হবে।
৫. print control দিয়ে invoice প্রিন্ট বা browser থেকে PDF হিসেবে সংরক্ষণ করুন।

## status-এর ক্রম
সাধারণ ক্রম: Pending → Confirmed → Preparing → Ready। Delivery হলে এরপর Out for delivery → Delivered; pickup/dine-in হলে Ready → Delivered।

## নিয়ম
ধাপ এড়িয়ে বা শেষ হওয়া order আবার আগের ধাপে নেওয়া যায় না। ভবিষ্যতের scheduled order প্রস্তুতির নির্ধারিত সময়ের আগে এগোনো বন্ধ থাকতে পারে। Historical Quick Delivery entry live workflow-তে নেওয়া যায় না। অন্য কর্মী status বদলে ফেললে refresh করে আবার পর্যালোচনা করুন।

> Order status পরিবর্তন মানে টাকা আদায় নয়। Refund করার জন্য status-এ Refunded বসানো যায় না; আলাদা refund workflow ব্যবহার করতে হয়।

# ০৮ | Order payment, refund ও stock return

**কোথায়:** Orders → order details → payment/refund অংশ।

## payment রেকর্ডের ধাপ
১. Ready, Out for delivery বা Delivered live order খুলুন।
২. আদায় করা পুরো total, Cash / Card / Other পদ্ধতি ও প্রয়োজনীয় reference দিন।
৩. Card/Other হলে terminal/manual reference আবশ্যক। একাধিক drawer-এর প্রসঙ্গে collection terminal নির্বাচন করুন।
৪. নিশ্চিত করার পর payment history ও Paid অবস্থা দেখুন।

## refund-এর ধাপ
১. captured payment থাকা order-এ refund amount বা প্রযোজ্য item quantity ও কারণ দিন।
২. অনুমতিসম্পন্ন ব্যক্তি request approve করবেন; এরপর manual payment সম্পন্ন করে completed রেকর্ড করবেন।
৩. stock ফেরত দিতে হলে সত্যিই ফেরত পাওয়া item নির্বাচন ও restock-এর আলাদা অনুমোদন দিন।

## নিয়ম
payment-এর amount order total-এর সমান হতে হয়; এই collection form আংশিক আদায়ের সাধারণ সুবিধা নয়। Refund মূল paid amount-এর অবশিষ্ট সীমা অতিক্রম করতে পারে না; pending refund reservation-ও বিবেচিত হয়। Requested/Approved মানেই টাকা ফেরত হয়েছে নয়।

Refund permission ও POS refund permission আলাদা। POS sale-এর void/refund POS History থেকে করুন। Cancelled/failed live order-এ প্রযোজ্য stock restoration হতে পারে; paid POS order cancel করে refund এড়ানো যায় না।

> Card refund আগে বাইরের terminal/provider-এ বাস্তবে সম্পন্ন করুন, তারপর reference রেকর্ড করুন। অ্যাপের payment record নিজে ব্যাংক লেনদেন করে না।

# ০৯ | POS / New Sale

**কোথায়:** Admin sidebar → POS / New Sale → `/pos`। **কারা:** Admin, Manager, Cashier।

## ধাপে ধাপে
১. সক্রিয় terminal নির্বাচন ও নিজের POS PIN/password দিয়ে unlock করুন।
২. প্রয়োজনীয় হলে shift খুলুন। product search/category থেকে item বা combo নিন।
৩. quantity, add-on, choice, spice ও item note পরীক্ষা করুন। Dine-in/Takeaway এবং Counter/Phone origin ঠিক করুন।
৪. customer যুক্ত করতে নাম, phone বা customer ID দিয়ে search করুন। নতুন account করলে customer's email ও তার পছন্দের password ব্যবহার করুন।
৫. policy অনুযায়ী discount, coupon বা reward নির্বাচন করুন।
৬. Cash/Card নির্বাচন করুন; cash received, change ও total মিলিয়ে Complete sale-এর confirmation দিন।
৭. receipt-এর order number দেখে Print Receipt ব্যবহার করুন।

## নিয়ম ও ফলাফল
সফল sale-এ অর্ডার, payment record ও recipe stock deduction একবারে হয়। Cash drawer কেবল প্রযোজ্য cash transaction-এ বদলায়। Card terminal আলাদা করে payment নেবে। Recipe missing বা saleable stock কম হলে sale block হতে পারে।

> Sale-এর ফল unknown দেখালে একই saved request থেকে recovery করুন। নতুন sale বানিয়ে একই টাকা আবার নেবেন না। Offline অবস্থায় অর্ডার নিশ্চিতভাবে জমা হয়েছে ধরে নেওয়া যায় না।

# ১০ | POS discount, customer, held sale ও shortcuts

## customer ও promotion
POS customer search-এ অন্তত ২ অক্ষর দিন। শুধু eligible active customer-এর সীমিত তথ্য পাওয়া যায়। Search unavailable মানে customer নেই নয়। Selected customer-এর points, membership ও eligible reward দেখে নির্বাচন করুন। Reward checkout-এ stock ও points-এর সঙ্গে যাচাই হয়।

Discount-এর percentage/amount, cashier limit ও manager approval Settings-এর policy অনুযায়ী চলে। Coupon দিয়ে Validate coupon করুন; manual discount-এর সঙ্গে coupon stack করা যায় না। শুধু preview সফল হলেই final sale নিশ্চিত নয়।

## Hold ও resume
১. চলমান cart রেখে অন্য কাজ করতে Hold sale দিন।
২. Held Sales খুলে সঠিক draft resume বা প্রযোজ্য action নিন।
৩. পুনরায় price, availability, reward ও stock পরীক্ষা করে sale সম্পন্ন করুন। Held sale payment বা completed sale নয়; expiry policy প্রযোজ্য।

## keyboard সহায়তা
| Shortcut | কাজ |
| --- | --- |
| Alt + S / Alt + H / Alt + R | Search / Hold sale / Held sales |
| Alt + C / Alt + D | Cash / Card নির্বাচন |
| Alt + Enter | Complete sale confirmation |
| Alt + L / F1 | Lock POS / Shortcut help |

Typing বা dialog খোলা থাকলে shortcut স্থগিত থাকে। PIN বারবার ভুল দিলে সাময়িক lock হতে পারে; অন্যের PIN ব্যবহার করবেন না।

# ১১ | POS shift ও cash closing

**কোথায়:** `/pos`-এর shift controls/history। Settings-এ shift module চালু থাকলে ব্যবহারযোগ্য।

## দৈনন্দিন ধাপ
১. shift খোলার সময় drawer-এর আসল opening cash ও notes দিন।
২. দিনের cash in/out, payout বা correction-এর সঠিক ধরন ও কারণ লিখুন।
৩. shift বন্ধের আগে অসম্পূর্ণ sale ও cash movement পর্যালোচনা করুন।
৪. বাস্তব টাকা গুনে counted amount দিন; denomination helper থাকলে ব্যবহার করুন।
৫. variance সীমা ছাড়ালে reason ও Manager/Admin approval সম্পন্ন করুন।
৬. closing snapshot ও history সংরক্ষিত আছে কি না দেখুন।

## নিয়ম
এক cashier-এর একটিই open shift থাকতে পারে। One open shift per terminal সেটিং অতিরিক্ত terminal constraint দেয়। Require open shift চালু থাকলে shift ছাড়া নতুন sale আটকে যায়। Blind close-এ cashier expected cash আগে দেখতে পারেন না।

Expected cash-এ opening cash এবং cash ledger-এর signed movement থাকে। Drawer difference = Counted cash minus Expected cash। Card sale drawer cash নয়। Reopen/close action কেবল যেটি UI ও permission-এ পাওয়া যায় সেটিই ব্যবহার করুন; ইতিহাসের পুরোনো closing-কে বর্তমান খোলা shift-এর closing ভাববেন না।

**নমুনা:** expected SAR 300, হাতে SAR 295 হলে difference -5। নিজের থেকে sale amount পাল্টিয়ে পার্থক্য ঢাকবেন না।

# ১২ | POS History, reprint, repeat, void ও refund

**কোথায়:** POS recent sales/history → Sale details। **বিশেষ কাজ:** Admin/Manager; cashier-এর history scope সীমিত।

## সাধারণ ধাপ
১. date, terminal, cashier বা অন্যান্য উপলব্ধ filter দিয়ে sale খুঁজুন।
২. total, refunded ও remaining refundable amount পরীক্ষা করুন।
৩. Receipt reprint দিয়ে পুরোনো রসিদ তুলুন; এতে duplicate/reprint চিহ্ন থাকে।
৪. Add items to new sale দিয়ে পুরোনো item নতুন cart-এ আনুন; বর্তমান catalog ও price আবার যাচাই হবে।

## void ও refund
Void sale-এ কারণ দিন; একই shift ও অনুমোদিত time window-সহ server-এর শর্ত মেনে চলতে হবে। Refund-এ full/partial amount অথবা item quantity নির্বাচন, পদ্ধতি, reference ও reason দিন। তারপর Request → Approve → Record completed payment।

## stock ফেরত
Restock default বন্ধ। Item refund-এ সত্যিই usable stock-এ ফেরত গেলে উপযুক্ত checkbox দিন। Void-এ সব item-এর stock ফেরত দেওয়ার আলাদা ঘোষণা রয়েছে। শুধু টাকা ফেরত বা receipt reprint করলে stock ফেরে না। ঐতিহাসিক ingredient/batch allocation ব্যবহার করে অনুমোদিত restoration হয়।

> Reprint নতুন বিক্রয় নয়। Repeat নতুন বিক্রয় তৈরি করার প্রস্তুতি। Void ও refund টাকার পৃথক সংশোধন; একই ভুল সমাধানে অসাবধানে দুটোই করবেন না।

# ১৩ | Quick Delivery Order: platform history লেখা

**কোথায়:** `/admin/quick-delivery`। **কারা:** Admin, Manager, Cashier।

এটি Jahez, Keeta, HungerStation ও Ninja-এর আগে সম্পন্ন বা বাতিল হওয়া অর্ডার লিখে রাখার form। এটি restaurant rider-কে live delivery দেওয়ার পেজ নয়।

## ধাপে ধাপে
১. চালু platform নির্বাচন করুন। External Order ID ও original order date/time দিন।
২. Branch এবং Completed/Cancelled নির্বাচন করুন।
৩. menu item/combo, quantity ও customization যোগ করুন।
৪. Platform total লিখুন। System total-এর সঙ্গে পার্থক্য হলে Difference reason দিন।
৫. notes পরীক্ষা করে Save Order অথবা Save & Add Next দিন।

## নিয়ম ও ফলাফল
একই platform-এর একই external ID পুনরায় লেখা বাধাগ্রস্ত হয়। ভবিষ্যতের original time দেওয়া যায় না। Completed entry বর্তমান eligible stock থেকে recipe ingredient একবার কাটে; আগের তারিখের stock অবস্থা পুনর্গঠন করে না। Cancelled entry revenue ও inventory বাড়ায়/কাটে না।

Aggregator prepaid sales হিসেবে রেকর্ড হয়; restaurant-এর cash collection বা platform settlement প্রমাণ হয় না। Platform total-এর পার্থক্য নিজে commission accounting তৈরি করে না।

**নমুনা:** system SAR 50, platform SAR 45 হলে -5-এর কারণ লিখুন। আগে সংরক্ষিত ID থাকলে নতুন entry দেওয়ার আগে সেটি খুলুন।

# ১৪ | Deliveries: rider assignment ও issue

**কোথায়:** `/admin/deliveries`। **পরিচালনা:** Admin/Manager। Cashier-এর সীমিত cash/history view আছে।

## workspace ও ধাপ
১. Active Deliveries-এ Rider Needed, Awaiting Pickup, On the Way ও Needs Attention দেখুন। আগের দিনের অসম্পূর্ণ delivery-ও আসতে পারে।
২. প্রয়োজন হলে Add existing order দিয়ে eligible restaurant-managed order enroll করুন। এতে নতুন sale তৈরি হয় না।
৩. order খুলে kitchen status, delivery stage ও rider availability দেখুন।
৪. rider নির্বাচন করে confirmation দিন; reassign হলে কারণ লিখুন। একই rider-কে আবার assign করা যায় না।
৫. issue থাকলে details ও timeline দেখে প্রযোজ্য resolution দিন।

## filter ও refresh
Search ও filter লিখলেই ফল বদলায় না। Apply/Enter, tab, summary, filter chip, pagination অথবা Refresh ব্যবহার করুন। এখানে timer/focus refresh নেই। Details বন্ধ করে আবার খুললে কিছু draft/expanded অংশ থেকে যেতে পারে।

## নিয়ম
Kitchen ready আর rider picked up আলাদা stage। Blocked/ineligible record review করা যায়; সবার assignment সম্ভব নয়। অন্য কেউ record বদলালে Refresh করে confirmation নতুন করে পর্যালোচনা করুন। ইতিহাসে contact/address-এর কিছু তথ্য গোপন থাকে।

**নমুনা:** kitchen Ready কিন্তু delivery Unassigned হলে rider assignment বাকি; order-কে নতুন করে লিখবেন না।

# ১৫ | Deliveries: Cash & Settlement ও History

**কোথায়:** Deliveries → Cash & Settlement / History। **কারা:** Admin/Manager এবং অনুমোদিত Cashier।

## কাজের ধাপ
১. delivered order-এর customer balance, rider-reported cash এবং cashier-confirmed receipt আলাদা করে দেখুন।
২. rider report থাকলে তার amount ও কোনো shortage পরীক্ষা করুন।
৩. cashier বাস্তবে টাকা বুঝে নিয়ে প্রযোজ্য terminal/open shift-এর মাধ্যমে receipt confirm করবেন।
৪. History-তে completed date, Riyadh date range ও অন্যান্য অনুমোদিত filter দিয়ে পুরোনো delivery দেখুন।

## cash state বুঝুন
**Collection pending:** গ্রাহকের কাছে সংগ্রহযোগ্য balance আছে; rider report নেই। **Awaiting confirmation:** rider টাকা জমার report দিয়েছেন, cashier নিশ্চিত করেননি। **Discrepancy:** shortage/পার্থক্য মেলানো বাকি। **Confirmed:** cashier receipt রেকর্ড করেছেন। **No collection:** আর আদায়ের প্রয়োজন নেই।

## নিয়ম
Rider-এর report টাকা আদায় নিশ্চিত করে না। Manager shortage acknowledge করলেও payment settled হয় না। Confirmed receipt নতুন revenue নয়। গ্রাহকের balance, rider report ও confirmed receipt যোগ করলে একই টাকা একাধিকবার গণনা হতে পারে।

> Cashier-এর Active tab, assignment ও rider directory নেই। শুধু authorized delivered cash reports ব্যবহার করুন। Awaiting cashier দেখলে গ্রাহকের কাছ থেকে আবার টাকা তুলতে বলবেন না।

# ১৬ | Menu Items: খাবার ও দাম

**কোথায়:** `/admin?tab=menu`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Add Item খুলে Item name, Description, Price (SAR) ও Category দিন।
২. Image URL or local path, Kitchen station, tags, calories ও ingredients পূরণ করুন।
৩. Available on public menu ও Featured on homepage প্রয়োজন অনুযায়ী নির্বাচন করুন।
৪. customization লাগলে সেটি চালু করুন; পরের অধ্যায়ের নিয়ম অনুসরণ করুন।
৫. Create Item / Update Item দিয়ে সংরক্ষণ করুন। public menu ও recipe mapping পরীক্ষা করুন।

## ঘরের অর্থ
Price হলো খাবারের বিক্রয়মূল্য। Ingredients-এর বর্ণনামূলক লেখা stock কাটার recipe নয়। Kitchen station খাবার রান্নার কাজ বণ্টনে সাহায্য করে। Featured homepage-এ দেখানোর নির্বাচন; availability আলাদা।

## তালিকা ও নিয়ম
Search/filter দিয়ে খুঁজে edit করুন। তালিকার Available/Hidden দিয়ে visibility বদলানো যায়। Delete একটি item সরায়; checkbox দিয়ে একাধিক বেছে Delete করা যায়। Confirmation-এ নির্বাচন মিলিয়ে নিন; bulk delete আংশিক ব্যর্থ হলে refresh করে বাকি item পরীক্ষা করুন। পুরোনো completed order-এর item snapshot নতুন দাম দেখে পুনর্লিখিত হয় না।

> নতুন খাবার প্রকাশের পর `/inventory/recipes`-এ recipe দিন অথবা ইচ্ছাকৃতভাবে Do Not Track সংরক্ষণ করুন। শুধু Available চালু থাকলেই বিক্রয় সফল হবে না।

# ১৭ | Menu customization: add-on, choice ও spice

**কোথায়:** Menu Items → item edit → Item customization।

## ধাপে ধাপে
১. আগে menu item তৈরি করুন। পরে edit করে Enabled চালু করুন।
২. Available add-ons থেকে existing add-on যুক্ত করুন; প্রয়োজন হলে New add-on-এ নাম, price, image ও applies-to items দিন।
৩. Choice groups-এ group name, Single select / Multiple select, Minimum, Maximum ও options নির্ধারণ করুন।
৪. spice চালু করলে available options ও Default spice level দিন।
৫. item save করে একটি নমুনা cart-এ নির্বাচনের আচরণ পর্যালোচনা করুন।

## ফলাফল
Add-on-এর দাম প্রতিটি সংশ্লিষ্ট menu item unit-এর সঙ্গে যুক্ত হয়। Choice group দিয়ে কিছু নির্বাচন বাধ্যতামূলক এবং কিছু optional করা যায়। Item-level note রান্নার নির্দেশ বোঝাতে পারে।

## নিয়ম
Shared add-on একাধিক menu item-এ ব্যবহার করা যায়; পরিবর্তনের আগে প্রভাব বুঝুন। Minimum/Maximum-এর সঙ্গে selection type মিলতে হবে। Default spice অবশ্যই অনুমোদিত option-এর মধ্যে রাখুন।

Physical add-on-এর stock deduction আলাদা Add-on Recipes থেকে নির্ধারিত হয়। খাবারের মূল recipe থাকলেও add-on recipe অনুপস্থিত হলে sale আটকে যেতে পারে।

**নমুনা:** burger SAR 20, cheese add-on SAR 2; দুই burger-এ একই add-on নিলে মূল customization multiplier-সহ দাম ও ingredient বাড়ে।

# ১৮ | Combos: প্যাকেজ তৈরি ও প্রকাশ

**কোথায়:** `/admin?tab=combos`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Create New Combo খুলুন। Combo Name, description, category ও image দিন।
২. Add Items to Combo দিয়ে menu item নির্বাচন ও প্রতিটির quantity দিন।
৩. Regular Total দেখুন; Combo Price (SAR) নির্ধারণ করুন।
৪. Available, Featured on Homepage ও Featured Position প্রয়োজনমতো ঠিক করুন।
৫. Preview পরীক্ষা করে Save as Draft বা Publish Combo দিন।

## নিয়ম ও ফলাফল
একটি combo-তে ১-১০টি স্বতন্ত্র menu item রাখা যায়; একই item duplicate line-এ নয়। প্রতিটি quantity ১-৯৯-এর পূর্ণ সংখ্যা। price শূন্যের বেশি হতে হয়। Published combo-তে unavailable menu item রাখা যায় না।

Draft public published combo নয়। তালিকা থেকে availability toggle, Edit ও Delete ব্যবহার করা যায়; Delete স্থায়ী, confirmation পড়ুন। Combo price খাবারগুলোর আলাদা regular total থেকে পৃথক। বিক্রির সময় প্রতিটি component-এর quantity অনুযায়ী recipe ingredient কাটে।

**নমুনা:** দুই burger ও এক drink-এর combo দুইবার বিক্রি হলে চার burger এবং দুই drink-এর recipe পরিমাণ হিসাব হবে।

# ১৯ | Admin Categories: Menu ও Blog আলাদা

**কোথায়:** `/admin?tab=categories`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Menu Categories বা Blog Categories নির্বাচন করুন।
২. Add Category-তে নাম, description, display order ও active/visible অবস্থা দিন।
৩. Save-এর পর সংশ্লিষ্ট selector ও public filter পরীক্ষা করুন।
৪. পুরোনো category খুঁজতে search ও Active/Inactive/All filter ব্যবহার করুন।

## নিয়ম
Menu category ও Blog category আলাদা content system। Inventory category তৃতীয় আলাদা তালিকা; Admin category দিয়ে ingredient grouping হয় না।

নতুন content-এ active category বেছে নিতে হয়। তালিকার Active/Inactive বাটন visibility বদলায়। Delete-এর আগে যুক্ত content ও confirmation পড়ুন: ব্যবহৃত category-তে fallback/reassignment প্রভাব থাকতে পারে; খালি category স্থায়ীভাবে সরতে পারে। নাম বদলালে connected selector ও public filter-এও প্রভাব পড়ে।

**পরামর্শ:** খাবারের জন্য Grill, Drinks ইত্যাদি এবং blog-এর জন্য News, Tips ইত্যাদি সরল নাম রাখুন। একই জিনিসের একাধিক বানানে category তৈরি করলে filter ব্যবহার কঠিন হয়।

**নমুনা:** Blog-এর Tips category তৈরি করলে Stock Items-এর category dropdown-এ তা আসবে না।

# ২০ | Customers: তথ্য, অর্ডার ও internal note

**কোথায়:** `/admin?tab=customers`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. customer ID, name, email বা phone দিয়ে খুঁজুন। With orders / No orders yet এবং sort ব্যবহার করুন।
২. customer খুলে Overview দেখুন।
৩. Orders-এ সংশ্লিষ্ট order history, Favourite Items-এ পছন্দ, Rewards-এ points history দেখুন।
৪. Internal Notes-এ প্রয়োজনীয় note লিখুন; edit/delete থাকলে সঠিক note বেছে নিন।

## ফলাফল ও নিয়ম
Customer directory দেখা নতুন account তৈরি বা payment collection নয়। Order-এর details বা action-এ গেলে সেই কাজের permission ও status আলাদা করে কার্যকর হয়।

Internal note customer-facing blog/review নয়; প্রয়োজনীয় operational তথ্য সংক্ষিপ্ত রাখুন। Points balance ও redemption history দেখে বোঝার চেষ্টা করুন; এই পেজকে ইচ্ছেমতো points যোগ/বিয়োগের form ধরে নেবেন না।

**পরামর্শ:** পরিচয় মেলাতে শুধু নামের ওপর নির্ভর করবেন না; phone বা readable customer ID মিলিয়ে নিন। sensitive তথ্য সাধারণ note-এ না রাখাই ভালো।

**নমুনা:** একই নামে দুই customer থাকলে `CUS` ID বা phone মিলিয়ে তার Orders খুলুন।

# ২১ | Offers: প্রচার, coupon ও schedule

**কোথায়:** `/admin?tab=offers`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Add Offer-এ title, subtitle/description, image, badge ও discount text দিন।
২. প্রদর্শনের Original price / Offer price এবং Order Now-এর menu item/combo ও quantity দিন।
৩. coupon লাগলে Promo code, Fixed amount/Percentage ও discount value নির্ধারণ করুন।
৪. scope হিসেবে entire order, linked product অথবা category নির্বাচন করুন। Minimum membership tier, registered-only, minimum order, maximum discount ও usage limit প্রয়োজনমতো দিন।
৫. Starts at, Expires at, sort order, CTA label/link, featured ও active অবস্থা ঠিক করে save করুন।

## নিয়ম
Public visibility active schedule ও status দিয়ে নিয়ন্ত্রিত। Homepage-এর লেখা বা display price নিজে checkout discount-এর প্রমাণ নয়; coupon rule checkout-এ যাচাই হয়। Linked product/category ভুল হলে intended item-এ offer নাও লাগতে পারে।

Reward points-এর পুরস্কার এখানে নয়; Rewards আলাদা। তালিকার Edit দিয়ে পরিবর্তন ও Delete দিয়ে promotion সরানো যায়; confirmation-এ offer মিলিয়ে নিন। Coupon usage limit, customer eligibility ও final cart-এর নিয়ম server আবার পরীক্ষা করে।

**নমুনা:** SAR 50 minimum order-এ SAR 5 coupon দিলে SAR 40 cart-এ সেটি চলবে না। Offer-এর মেয়াদ শেষে শুধু banner দেখেই discount দেওয়ার সিদ্ধান্ত নেবেন না।

# ২২ | Rewards: points দিয়ে পুরস্কার

**কোথায়:** `/admin?tab=rewards`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Add Reward-এ reward name, description ও image দিন।
২. Required points, Linked menu item ও Minimum membership tier নির্বাচন করুন।
৩. sort order, optional expiry ও Active অবস্থা দিন।
৪. Create Reward / Update Reward-এর পর reward তালিকা দেখুন।

## কীভাবে কাজ করে
Customer eligible হলে points দিয়ে linked menu item-এর reward নিতে পারেন। Backend points balance, tier, expiry ও item-এর বৈধতা যাচাই করে। POS-এ eligible reward নির্বাচন করলে checkout-এ reward item যোগ হয়।

## নিয়ম
Offer coupon, item reward ও checkout points discount আলাদা ব্যবস্থা। সবগুলোকে একই discount মনে করবেন না। Stock-tracked reward item-এর valid recipe ও stock দরকার হতে পারে।

Order points earning paid এবং completed/delivered অবস্থার সঙ্গে সম্পর্কিত; শুধু cart বা held sale-এ points আয় নিশ্চিত হয় না। Cancellation/refund-এ points policy কাজ করে। Delete reward দিলে available তালিকা থেকে সরে যায়; existing order/points history রাখা হয়।

**নমুনা:** 500 points-এর reward customer-এর 300 points থাকলে নির্বাচনের যোগ্য হবে না। Required points লেখা বদলালে আগের points transaction নিজের থেকে মুছে যায় না।

# ২৩ | Blog ও Reviews: প্রকাশনা ও moderation

**কোথায়:** `/admin?tab=blog` এবং `/admin?tab=reviews`। **কারা:** Admin/Manager।

## Blog-এর ধাপ
১. নতুন post-এ Title, Short excerpt ও Full article content দিন।
২. Cover Image URL, Blog category, Author ও comma-separated tags দিন।
৩. Published (visible to visitors) checkbox ঠিক করে Publish Article / Update Article দিয়ে save করুন।
৪. public blog-এ title, excerpt, image ও article পরীক্ষা করুন। পুরোনো post edit বা delete-এর আগে সঠিক post মিলিয়ে নিন।

## Reviews-এর ধাপ
১. customer name, rating, comment, item, order reference ও date দেখুন।
২. অপসারণ প্রয়োজন হলে সংশ্লিষ্ট Delete review বাটন ব্যবহার করুন।
৩. confirmation-এ সঠিক rating/item মিলিয়ে নিশ্চিত করুন।

## নিয়ম
Review প্রকল্পে delivered order-এর verified customer review হিসেবে ব্যবহৃত হয়। Review delete স্থায়ী অপসারণ; এটি inventory item archive-এর মতো শুধু inactive করা নয়। Review edit/reply-এর সুবিধা এই পেজে নিশ্চিত করা হয়নি।

**পরামর্শ:** Blog excerpt সংক্ষিপ্ত রাখুন। শুধু image URL যোগ করা মানে project-এ file upload হয়েছে নয়; image উৎসটি কাজ করছে কি না পরীক্ষা করুন।

**নমুনা:** Blog category-তে News দেওয়া post-এর category; menu বা stock grouping বদলায় না।

# ২৪ | Analytics ও রিপোর্টের সঠিক অর্থ

**কোথায়:** `/admin?tab=analytics`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. সময়সীমা, sales source এবং order type নির্বাচন করুন।
২. Net Sales, Orders, Average Order Value, Discount ও Refund দেখুন।
৩. daily trend, source/type breakdown, best/least-selling item ও order status দেখুন।
৪. উপলব্ধ CSV/PDF export দিয়ে একই filter-এর রিপোর্ট নিন।

## সংজ্ঞা
**Gross sales:** captured order total; discount আগেই এতে সমন্বিত। **Net sales:** gross থেকে completed refund ও overlapping নয় এমন captured void বাদ। **Recorded collections:** restaurant-এর internal collection records; aggregator prepaid বাদ। **Average order value:** মূল gross captured sales / captured-order count।

## তারিখের নিয়ম
Order-date report-এ original order date লাগে; historical platform entry-তে তার original occurrence time। পরে refund হলে পুরোনো sales cohort বদলাতে পারে। Event-date report-এ কেবল জানা capture/refund/void তারিখ ব্যবহার হয়; missing timestamp বানিয়ে পূরণ হয় না। সব ব্যবসায়িক দিন Asia/Riyadh।

> Net sales লাভ নয়। Discount দ্বিতীয়বার বাদ দেবেন না। Item ranking-এর line value-কে net item revenue ধরবেন না। Aggregator sales-কে restaurant cash বা bank settlement-এর সমান ধরে নেবেন না।

# ২৫ | Audit Log: কে কী বদলেছেন

**কোথায়:** `/admin?tab=audit`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. actor, action বা record লিখে search করুন।
২. record type, action ও From/To date দিয়ে সংকুচিত করুন।
৩. record খুলে Before, After, related records ও metadata দেখুন।
৪. সন্দেহজনক ঘটনার সময়, actor এবং মূল record-এর ইতিহাস মিলিয়ে দেখুন।

## কী পাওয়া যায়
Inventory পরিবর্তন, ক্রয় অনুমোদন, payment reversal, staff change ও অন্যান্য operational action-এর audit record থাকতে পারে। ঘটনা অনুযায়ী field ও detail ভিন্ন হয়।

## নিয়ম
Audit Log স্থায়ী কার্যক্রমের ইতিহাস দেখার জায়গা। এটি মূল record edit করার form নয়। একটি audit entry থাকা নিজে card provider settlement বা শারীরিক stock-এর নিশ্চয়তা নয়; সংশ্লিষ্ট মূল record/বাস্তব তথ্য মিলিয়ে নিতে হয়।

**পরামর্শ:** কোনো correction-এর কারণ স্পষ্ট লিখলে পরে audit বোঝা সহজ হয়। “ভুল” লেখার বদলে “Invoice-এর quantity 10-এর জায়গায় 12 হয়েছিল” লিখুন।

**নমুনা:** stock item-এর preferred brand কে বদলেছেন দেখতে item reference দিয়ে log খুঁজে Before/After তুলনা করুন।

# ২৬ | Staff: account ও প্রবেশাধিকার

**কোথায়:** `/admin/staff` → Employees। **দেখেন:** Admin/Manager। **পরিবর্তন করেন:** Admin।

## ধাপে ধাপে
১. Add staff খুলে name, email, phone ও role দিন।
২. joining date ও default shift নির্বাচন করুন।
৩. temporary password দিন: অন্তত ১০ অক্ষর; uppercase, lowercase, number ও symbol থাকতে হবে।
৪. Staff Clock লাগলে active shift, ৪-৬ digit Attendance PIN এবং Enable Staff Clock access দিন।
৫. Save করে employee ID, role ও account status পরীক্ষা করুন।

## পরবর্তী কাজ
Search দিয়ে staff খুঁজে edit, deactivate/reactivate, reset password বা reset Attendance PIN করুন। Password/PIN save-এর পরে পুরোনো secret দেখা যায় না। Manager শুধু তালিকা ও তথ্য দেখতে পারেন।

## নিয়ম
Role অনুযায়ী workspace ও action বদলায়। Attendance PIN ও POS PIN আলাদা কাজে ব্যবহৃত; এক জায়গায় PIN reset করলে অন্যটির পরিবর্তন হয়েছে ধরে নেবেন না। Attendance চালাতে active shift ও secure PIN দরকার।

**পরামর্শ:** দায়িত্ব অনুযায়ী role দিন। কর্মী বদলি হলে shared account চালু রাখার বদলে নিজস্ব account ব্যবহার করুন।

**নমুনা:** Inventory role দিলে ওই কর্মী stock entry করতে পারবেন; PO approve বা Staff edit-এর অধিকার পাবেন না।

# ২৭ | Attendance, Shifts, Leave ও Staff Clock

**কোথায়:** `/admin/staff/attendance`, `/shifts`, `/leave`; Open Staff Clock → `/staff-clock`। **লেখার অধিকার:** Admin; Manager read-only।

## Shift template
Create shift-এ name, start/end time, grace minutes, working days ও active অবস্থা দিন। Staff-এর default shift হিসেবে সেটি দিন। Shift archive-এর আগে সংশ্লিষ্ট active staff-কে অন্য shift দিন; ইতিহাস সংরক্ষিত থাকে।

## Attendance ও correction
১. Staff Clock-এ কর্মী পরিচয়/PIN দিয়ে Clock in/out করবেন।
২. Attendance-এ Today/Yesterday/Custom, date range, staff, shift ও status দিয়ে দেখুন।
৩. Details-এ worked/overtime, late time ও audit দেখুন।
৪. Admin ভুল সময়/status সংশোধন করলে Clock in/out (Riyadh), notes ও correction reason দিন।

## Leave ও monthly report
Leave-এ staff, annual/sick/emergency/day off/other, সময়সীমা ও প্রযোজ্য তথ্য দিন। Admin Pending request Approve/Reject করেন। Approved leave অনুপস্থিতি বোঝার ক্ষেত্রে প্রভাব ফেলে। Attendance-এর নিচে Monthly Staff Report-এ month ও employee দিয়ে present, late, absent, leave, worked ও overtime দেখুন।

> Staff shift template এবং POS cash shift আলাদা। Monthly report payroll-এর প্রস্তুতিমূলক তথ্য; এটি স্বয়ংক্রিয় বেতন প্রদান নয়।

# ২৮ | Finance & Expenses: খরচ লেখা

**কোথায়:** `/admin/expenses` → Overview / Entries। **লেখেন:** Admin/Accountant। **Manager:** read-only।

## ধাপে ধাপে
১. Entries → Add Expense খুলুন। Title, category, vendor ও Total amount দিন।
২. Expense date, optional due date ও included VAT/tax amount দিন। VAT ঘরে মোটের অন্তর্ভুক্ত অংশ লিখবেন; আবার total-এর ওপর যোগ করবেন না।
৩. টাকা দেওয়া হয়ে থাকলে Amount paid, Payment date ও method দিন।
৪. reference, branch, notes ও receipt/invoice URL দিন। Save-এর পর system-generated Expense ID লিখে রাখুন।

## নিয়ম
Amount paid total ছাড়াতে পারে না। Paid amount থাকলে method ও date প্রয়োজন। Payment status amount থেকে নির্ধারিত: Unpaid, Partially paid বা Paid। সাধারণ edit-এ আগের paid amount কমানো/মুছে দেওয়া যায় না।

Receipt URL trusted storage-এর লিংক; এখানে local file upload-এর নিশ্চয়তা নেই। এই module operating expense-এর জন্য; inventory purchase invoice আলাদা Supplier Invoices-এ থাকে।

**নমুনা:** SAR 1000 rent-এর SAR 400 paid লিখলে remaining SAR 600। এটি invoice supplier payment-এর সঙ্গে নিজের থেকে যুক্ত হবে না।

# ২৯ | Expense archive, cancellation, recurring ও reports

## archive বনাম cancel
Entries default active working list। Archive করলে খরচ তালিকা থেকে আড়াল হয়, কিন্তু financial history/report-এ থাকে। Record State থেকে Archived/Cancelled/All historical records দেখুন।

Cancel আলাদা কাজ। Unpaid bill cancel করতে কমপক্ষে ৩ অক্ষরের কারণ লাগে। Paid/partially paid expense cancel করা যায় না; paid amount edit করে শূন্য করেও নয়। বর্তমান module-এ expense payment reversal ledger নেই।

## Recurring
১. Recurring → Add Template-এ title, category, default amount ও included tax দিন।
২. Monthly/Quarterly/Yearly frequency, start/end ও next due date দিন।
৩. active রাখুন; Generate Due Bills দিয়ে প্রাপ্য bill তৈরি করুন।
৪. নতুন unpaid entries পর্যালোচনা করে payment আলাদাভাবে লিখুন। একই period-এ duplicate generation প্রতিরোধ করা হয়।

## Categories ও Reports
Categories-এ নাম ও প্রযোজ্য তথ্য রাখুন; ব্যবহৃত category archive হয়। Reports-এ date/category/payment/type/search filter এবং CSV/PDF export আছে। Archived valid expenses report-এ থাকে। Recognized amount ও Original amount আলাদা হতে পারে, বিশেষ করে cancelled historical record-এ।

> Recurring bill generation টাকা পরিশোধ করে না। Expense report expense-date বিশ্লেষণ; cash-flow, COGS বা net profit নয়।

# ৩০ | Restaurant Settings: সময় ও customer checkout

**কোথায়:** `/admin?tab=settings`। **কারা:** Admin/Manager; বিশেষ Rider activation Admin-only।

## Business Hours
১. Sat-Thu group ও Friday group-এর open/closed ও সময় ঠিক করুন। প্রয়োজনে Add second service period দিন; closing midnight পার হতে পারে। group edit সেই group-এর সব দিনে প্রযোজ্য হয়। Operational timezone Asia/Riyadh।
২. Customer checkout scheduling চালুর আগে opening hours বাস্তব সময়ের সঙ্গে মিলিয়ে যাচাই করুন।
৩. পরিবর্তন শেষে Save Settings দিন; Reset saved অবস্থায় ফেরায়। Unsaved changes রেখে বের হলে সতর্কতা আসে।

## Customer checkout-এর তিন অংশ
**Points:** enabled, discount-এর points-per-SAR, minimum points, maximum discount, coupon-এর সঙ্গে ব্যবহার ও proportional refund policy।

**Delivery:** restaurant latitude/longitude, circular radius ও fixed fee। নির্দিষ্ট এলাকার বাইরে delivery eligibility ব্যর্থ হতে পারে।

**Scheduling:** slot interval, প্রতি slot ও fulfillment type-এর capacity, booking lead time এবং সর্বোচ্চ ৩০ দিনের horizon। pickup/delivery capacity আলাদা। Opening hours confirmed নির্বাচন প্রযোজ্য।

## নিয়ম
এই service-গুলো configure/enable না করা পর্যন্ত চালু ধরে নেবেন না। Scheduled order-এর preparation time, business hours ও slot capacity একসঙ্গে কার্যকর। Points restoration-এ পুরোনো refund adjustment থাকলে আগে সেটি মেটানো হতে পারে।

**পরামর্শ:** সময়/fee বদলানোর পরে সংশ্লিষ্ট customer checkout-এ প্রদর্শিত summary মিলিয়ে দেখুন।

# ৩১ | Settings: order, notification ও preparation

## Orders & Delivery
Delivery fee, Minimum delivery order এবং Website, POS, Phone ও partner channel-এর availability নির্ধারণ করুন। Minimum delivery order পণ্যের subtotal-এর জন্য। Customer checkout delivery-এর নিজস্ব fee configuration-ও আছে; দুই অংশ মিলিয়ে পর্যালোচনা করুন।

## Notifications
Admin order sound ও Kitchen order sound আলাদা toggle। Repeat interval ২-৩০০ seconds, maximum repeats ১-৫০০ এবং polling interval ৩-৬০ seconds। Browser-এর sound/notification permission-ও প্রভাব ফেলতে পারে।

## Preparation
Default preparation time ও Pending attention after ১-২৪০ minutes। Default estimate নতুন order-এর জন্য; পুরোনো order-specific estimate নিজে overwrite হয় না। Pending attention threshold শুধু Dashboard-এ মনোযোগের সংকেত বদলায়।

## সংরক্ষণ ও ফলাফল
১. প্রয়োজনীয় ঘর পরিবর্তন করুন।
২. Save Settings দিন; All changes saved দেখুন।
৩. প্রাসঙ্গিক পেজে ফিরে নতুন অবস্থা যাচাই করুন।

> Channel বন্ধ করা আগের order-এর fulfillment শেষ করে না। Notification off করলে order বন্ধ হয় না। Preparation attention অতিক্রম করলেই order নিজে cancel হয় না।

**নমুনা:** Pending attention ৫ minutes হলে তার বেশি অপেক্ষা করা live pending order attention-এ আসতে পারে; আর্থিক period বদলালেও সেই কাজ বাকি থাকে।

# ৩২ | Settings: POS policy, terminal ও PIN

## POS Shifts & Cash Closing
Enable shift module, Require open shift, Blind close, One open shift per terminal ও Variance approval threshold দিন। Module বন্ধ থাকলে require-open-shift-ও প্রযোজ্য থাকে না। বড় variance-এ reason এবং Manager/Admin approval লাগে।

## POS Checkout Policy
Discount enabled, cashier max percentage/amount, manager threshold, held sale expiry, pickup token এবং takeaway name/phone requirement নির্ধারণ করুন। Inactivity auto-lock 0/1/5/10/15 minutes; 0 disabled। Same-shift void window মিনিটে নির্ধারণ করা হয়।

## POS Terminals
১. POS Terminals-এ terminal code/name ও active অবস্থা তৈরি/সম্পাদনা করুন।
২. স্থায়ী code পরে বদলানো যায় না; পুরোনো sales/shift history পরিচয় ধরে রাখে।
৩. cashier device-এ সঠিক terminal নির্বাচন করুন; নতুন device নিজে MAIN বেছে নিয়েছে ধরে নেবেন না।

## POS Staff PINs
staff নির্বাচন করে নতুন ৪-৬ digit POS PIN সেট করুন। PIN বদলালে পুরোনো POS session lock হয়ে আবার sign in দরকার হয়। এটি Staff Clock-এর Attendance PIN থেকে আলাদা।

**পরামর্শ:** drawer ও device-এর নাম এমন রাখুন যাতে cashier বুঝে সঠিক terminal বেছে নিতে পারেন। অকারণে cash shift-এর মাঝখানে terminal deactivate করবেন না।

# ৩৩ | Settings: procurement, receipt, contact ও Rider

## Purchasing & Payables
Admin approval threshold, over-receive tolerance, invoice quantity/price tolerance, amount tolerance, large payment threshold ও price alert threshold নির্ধারণ করুন। Block unusual purchase-price increases চালু থাকলে policy অনুযায়ী override reason দরকার হয়। এই policy PO, receiving, invoice ও payment-এ প্রভাব ফেলে।

## Receipt ও Location & Contact
Restaurant display name, header/footer, website ও optional logo দিন। Shared location-এ address, city/country, phone, WhatsApp, email ও maps URL দিন। Receipt-এর contact একই shared location থেকে আসে। Rider-এর restaurant contact-ও stored operational phone-এর ওপর নির্ভর করে।

## Delivery Rider
শুধু Admin এই বিশেষ toggle দিয়ে restaurant rider workflow enable/disable করেন। এর নিজস্ব save/confirmation flow আছে; সাধারণ Save Settings-এর সঙ্গে এক করে ধরে নেবেন না। Enabled হলে availability, manual assignment, pickup, delivery ও cashier confirmation ব্যবহারযোগ্য হয়।

## ফলাফল
Receipt design payment processing নয়। Logo/address save করলেই কোনো regulatory tax integration তৈরি হয় না। Procurement threshold ছাড়ানো কাজ যথাযথ অনুমতি ছাড়া চলবে না।

**নমুনা:** PO threshold SAR 1000 হলে SAR 1200-এর PO অনুমোদনে Admin দরকার; requester নিজে Admin হলেও high-value self-approval-এর অতিরিক্ত override শর্ত থাকতে পারে।

# ৩৪ | Inventory Overview ও স্বাস্থ্য

**কোথায়:** `/inventory`। **কারা:** Admin, Manager, Inventory, Storekeeper।

## ধাপে ধাপে
১. Total Items, Inventory Value, Low Stock, Out of Stock ও Expiring Soon দেখুন।
২. Stock Items, Low Stock Alerts, Expiry Tracking বা Purchasing Action Center-এর লিংক খুলুন।
৩. recent stock activity, category distribution, supplier purchase value ও valuation trend দেখুন।
৪. missing cost বা quantity mismatch থাকলে Review valuation থেকে detail পর্যালোচনা করুন।
৫. কাজের আগে প্রয়োজন হলে Refresh দিন।

## তিনটি গুরুত্বপূর্ণ সংখ্যা
**Physical stock:** নথিতে থাকা মোট পরিমাণ। **Saleable/usable stock:** বিক্রির জন্য উপযুক্ত batch-এর পরিমাণ। **Inventory value:** সংরক্ষিত cost policy অনুযায়ী মূল্য; এটি sales revenue নয়।

## নিয়ম
Quarantined, damaged, expired বা প্রয়োজনীয় expiry অজানা stock physical হিসাবে থাকতে পারে, কিন্তু saleable নাও হতে পারে। Cost missing বা batch coverage কম থাকলে valuation-এর সীমা বুঝে রিপোর্ট ব্যবহার করুন।

Supplier purchase total সবসময় paid invoice total নয়; PO, receipt, payable ও payment আলাদা ধাপ। Overview দেখা কোনো stock পরিবর্তন করে না।

**নমুনা:** physical 10 kg-এর মধ্যে expired 3 kg হলে অন্য সব শর্ত ঠিক থাকলেও saleable সর্বোচ্চ 7 kg হতে পারে।

# ৩৫ | Inventory Categories ও Suppliers

**কোথায়:** `/inventory/categories` এবং `/inventory/suppliers`। **লেখেন:** inventory write অনুমতিপ্রাপ্ত ভূমিকা।

## Category তৈরি
১. Add category-তে name, stable SKU prefix, description, color ও active অবস্থা দিন।
২. prefix ২-১২টি uppercase letter/number; blank থাকলে সিস্টেম উপযুক্ত prefix নির্ধারণ করতে পারে।
৩. Create category দিন। নাম পরে বদলানো যায়, prefix স্থায়ী। Active item সরানো/archive না করলে category archive বাধা পায়।

## Supplier তৈরি
১. Add supplier-এ unique code/name দিন।
২. contact name, phone, email, tax number, payment terms, address ও notes দিন।
৩. default lead time ০-৩৬৫০ days-এর মধ্যে রাখুন; active অবস্থা দিন।
৪. save করে supplier-এর purchases/history দেখুন।

## নিয়ম ও ফলাফল
Supplier হলো বিক্রেতা প্রতিষ্ঠান; Brand হলো পণ্যের প্রস্তুতকারক/পরিচয়। একই supplier একাধিক brand দিতে পারেন। Supplier archive পুরোনো purchase history মুছে দেয় না। নতুন purchase-এর জন্য active supplier দরকার।

**নমুনা:** supplier “Sample Foods Co.”, brand “Sample Dairy”। দুটিকে এক ঘরে লিখবেন না। Inventory category “DAIRY” Admin-এর menu category থেকে আলাদা।

# ৩৬ | Stock Items: ingredient record

**কোথায়:** `/inventory/stock-items` → Add item। **কারা:** Admin/Manager/Inventory/Storekeeper।

## ধাপে ধাপে
১. Item name ও category দিন। Suggested SKU নিন; প্রয়োজন হলে Regenerate বা বৈধ manual SKU দিন।
২. Usage/base unit, Purchase unit ও Base units per purchase unit ঠিক করুন।
৩. Opening stock base unit-এ এবং Base unit cost দিন।
৪. Primary supplier, Preferred Brand ও storage location দিন।
৫. reorder level, target/par, safety, lead time, supplier item code ও Smart reorder দিন।
৬. Track expiry চালু হলে expiry দিন; Active item পরীক্ষা করে Create item দিন।

## নিয়ম
SKU uppercase letter, number ও hyphen-এর unique পরিচয়; creation-এর পরে বদলায় না। Opening stock শুধু নতুন item-এ; পরের quantity change movement/count দিয়ে হয়। Stock থাকা অবস্থায় base unit পরিবর্তন করা যায় না। Track expiry item-এ expiry না থাকলে stock saleable হওয়ার বাধা থাকতে পারে।

তালিকায় search/category/supplier/status/sort এবং physical/saleable balance দেখুন। Archive করলে inactive হয়; transaction history থাকে।

> বর্তমান সীমাবদ্ধতা: Minimum order quantity ও Order multiple form-এ থাকলেও item payload validation সেগুলো সংরক্ষণে পাঠায় না। Save-এর পর কার্যকর মান নিশ্চিত না করে custom MOQ/multiple ধরে reorder করবেন না; নতুন record-এ model default 1 থাকতে পারে।

# ৩৭ | Unit, conversion, cost ও brand

## কেন দুটি unit
Recipe, stock balance ও deduction base unit-এ চলে। Purchase order/receipt purchase unit-এ হতে পারে। Conversion factor বলে ১ purchase unit-এ কত base unit।

## সহজ নমুনা
Base unit `kg`, purchase unit `carton`, factor `10`। এক carton-এর দাম SAR 120 হলে base unit cost SAR 12/kg। তিন carton receive করলে 30 kg যোগ হবে। Recipe-তে 0.25 kg লাগলে 120 portion-এর ingredient পরিমাণ হয়; বাস্তবে অন্য ingredient ও eligibility-ও দেখতে হবে।

## কোন form-এ কোন পরিমাণ
| কাজ | unit |
| --- | --- |
| Opening stock, Stock Out, Waste, Count, recipe | Base unit |
| PO quantity ও receipt quantity | PO-তে সংরক্ষিত purchase unit |
| Manual Stock In | নির্বাচিত item-এর purchase unit; conversion প্রযোজ্য |
| Adjustment | কাঙ্ক্ষিত চূড়ান্ত base-unit balance |

## নিয়ম
Factor শূন্যের বেশি; purchase/base unit একই হলে factor 1। Receipt ও invoice quantity সর্বোচ্চ ৬ decimal। Recipe-তে `g` লিখে `kg` quantity নিজে অনুমান করে conversion হয় না; base unit অনুসরণ করুন।

Preferred Brand, Requested Brand ও Actual Brand পৃথক। PO-তে requested এবং receipt-এ actual brand লিখলে ইতিহাস পরিষ্কার থাকে। Brand সর্বোচ্চ ১২০ অক্ষর।

# ৩৮ | Batches / Lots, expiry ও FEFO

**কোথায়:** `/inventory/batches`। এটি batch দেখা ও বিশ্লেষণের পেজ।

## ধাপে ধাপে
১. item, supplier, brand এবং Active/Expiring soon/All batch filter দিন।
২. lot number, received date, physical remaining, conversion, expiry ও cost দেখুন।
৩. blocked/unknown/unallocated stock-এর ব্যাখ্যা পড়ুন।
৪. ভুল পেলে উৎস receipt/movement ও অনুমোদিত correction process মিলিয়ে দেখুন; batch history মুছে সমাধান করবেন না।

## বিক্রির stock বাছাই
FEFO অর্থ First Expiry, First Out: উপযুক্ত batch-এর মধ্যে আগে expiry হওয়া batch আগে ব্যবহৃত হয়। Usable quality, positive balance ও সঠিক expiry policy লাগবে। Quarantined, damaged ও expired batch বিক্রিতে অংশ নেয় না।

## expiry নিয়ম
Expiry date-এর পুরো Asia/Riyadh দিন পর্যন্ত মেয়াদ বৈধ; পরের দিনের শুরুতে expired। Expiry-tracked item-এর missing expiry saleable নয়। Non-expiry-tracked item-এ date না থাকা চলতে পারে; জানা expired date থাকলে সেটিও বাদ যায়।

পুরোনো item-only stock-এর fallback কেবল item-এর কোনো batch record কখনো না থাকলে প্রযোজ্য হতে পারে। Depleted batch-ও ইতিহাসের অংশ। Physical ও batch mismatch থাকলে অজানা অংশকে নিজে fresh/saleable ধরা হয় না।

# ৩৯ | Purchase Orders: draft থেকে ordered

**কোথায়:** `/inventory/purchase-orders`। **তৈরি/সম্পাদনা:** inventory writers। **Approve/Reject:** Admin/Manager; threshold অনুযায়ী Admin।

## ধাপে ধাপে
১. Create draft PO-তে active supplier ও expected date দিন।
২. Add line দিয়ে item, purchase quantity, purchase unit cost, requested brand ও প্রযোজ্য expiry দিন।
৩. Tax, Discount, Additional charges, notes ও প্রয়োজনীয় price override reason দিন।
৪. draft save → Submit → Approve → Mark ordered করুন।
৫. timeline-এ revision ও approval দেখুন।

## নিয়ম
প্রতিটি নতুন PO draft। Order হওয়ার আগে material edit approval invalid করতে পারে; পুনরায় workflow দেখুন। Ordered/partially received/received/closed short/cancelled PO সাধারণ edit করা যায় না। Rejected PO সংশোধনের জন্য edit করে প্রযোজ্য draft workflow অনুসরণ করুন।

Approval threshold-এর বেশি total হলে Admin লাগে। উচ্চমূল্যের requester নিজে approve করতে চাইলে Admin emergency override ও কারণের শর্ত আছে; UI-তে সেই option না থাকলে সাধারণ approve সফল হবে না।

> PO তৈরি বা Approved/Ordered করা stock বাড়ায় না। টাকা পরিশোধও হয় না। মাল হাতে পাওয়ার পর Receive করতে হবে।

# ৪০ | Receive PO: মাল গ্রহণ ও retry

**কোথায়:** Purchase Orders → Ordered / Partially received → Receive।

## ধাপে ধাপে
১. শুধু আজ পাওয়া line নির্বাচন করুন; না পাওয়া line unselected রাখুন।
২. Received quantity purchase unit-এ লিখুন; শূন্যের বেশি ও সর্বোচ্চ ৬ decimal।
৩. Batch/Lot, Actual Brand, Received date, Expiry date ও notes দিন। Blank lot-এ স্বয়ংক্রিয় lot হতে পারে।
৪. Ordered/Received/Remaining মিলিয়ে submit করুন।
৫. receipt result, batch ও Stock Movements পরীক্ষা করুন।

## partial, over-receive ও close short
একাধিক receipt-এ partial গ্রহণ করা যায়। সব line পূরণ হলে Received হয়। অনুমোদিত cumulative tolerance-এর মধ্যে অতিরিক্ত গ্রহণেও Admin/Manager ও কারণ লাগে; cap ছাড়িয়ে গ্রহণ block। অবশিষ্ট আর আসবে না হলে Admin/Manager কারণ দিয়ে Closed Short করেন; এতে stock বাড়ে না।

## নেটওয়ার্ক ব্যর্থ হলে
Form original submission/key session storage-এ রাখে। Pending submission / Retry Original Receipt এলে আগের একই তথ্য আবার পাঠান। ফল unknown অবস্থায় storage clear, payload বদল বা নতুন receipt করবেন না। তথ্য হারালে আগে PO/movement history যাচাই করুন।

> সফল Receive batch, stock, movement ও purchase price history বদলায়। একই delivery manual Stock In-এ আবার লিখলে duplicate stock হবে।

# ৪১ | Supplier Invoices: বিল ও তিনভাবে মিল

**কোথায়:** `/inventory/supplier-invoices`। **পেজে কার্যকর ব্যবহার:** Admin/Manager; Accountant-এর বাধা অধ্যায় ০২ দেখুন।

## ধাপে ধাপে
১. Add invoice-এ supplier, supplier invoice number, invoice/due date দিন।
২. একই supplier-এর PO ও পাওয়া line নির্বাচন করুন; invoice-এ না থাকা line সরান।
৩. invoice quantity, unit price, brand, tax/discount/charges ও notes দিন।
৪. Save draft → Submit → mismatch থাকলে Review → Approve → Post করুন।
৫. details-এ match messages, received/committed/remaining snapshot ও outstanding দেখুন।

## তিনভাবে মিল
PO-তে চাওয়া quantity/price, সত্যিই received quantity এবং supplier-এর bill মিলিয়ে দেখা হয়। একই supplier-এর normalized invoice number duplicate হতে পারে না। Draft bill proposal; অন্য invoice-এ আগে commitment থাকলে নতুন billable quantity কমে।

## নিয়ম
Received-এর বেশি invoicing সবসময় mismatch; tolerance-এর মধ্যেও প্রযোজ্য Manager/Admin reason দরকার। Cap ছাড়িয়ে free-text reason দিয়েও commit করা যায় না। Review Required edit করলে Draft হয় এবং পুরোনো reservation মুক্ত হয়। Approved ও Posted-এ পুনরায় validation হয়।

> Invoice save/post করলে stock দ্বিতীয়বার বাড়ে না। Invoice payment নয়। Submitted, Review Required, Approved, Posted ও Disputed quantity reserve করে; Draft ও Voided করে না।

# ৪২ | Supplier payment, reversal ও aging

**কোথায়:** Supplier Invoices → Posted invoice → Record payment / View।

## payment-এর ধাপ
১. Total, Paid ও Outstanding মিলিয়ে নিন।
২. amount, payment date, method, transaction reference ও note দিন।
৩. বাস্তবে সম্পন্ন payment রেকর্ড করুন; successful result ও payment number দেখুন।
৪. outcome unknown হলে form-এর saved original submission/retry ব্যবহার করুন; একই payment নতুন করে লিখবেন না।

## নিয়ম
Posted invoice ছাড়া payment হয় না; amount শূন্যের বেশি এবং outstanding-এর মধ্যে। Large payment threshold অতিক্রম করলে Admin/Manager লাগে। Completed payment reverse করার অধিকার Admin/Manager-এর; কারণ বাধ্যতামূলক। Reversal history থাকে ও outstanding আবার বদলায়।

Paid invoice void করার আগে completed payment reverse করতে হয়। Disputed invoice quantity reserve করতে থাকে; শুধু dispute করলেই billable availability ফেরে না। কিছু dispute transition backend-এ থাকলেও তালিকার সব action হিসেবে নেই।

## aging বোঝা
Current, 1-30, 31-60, 61-90 ও 90+ days bucket বকেয়ার বয়স বোঝায়। Due today Riyadh day শেষ না হওয়া পর্যন্ত overdue নয়।

**নমুনা:** invoice SAR 1000, completed payment SAR 400 হলে outstanding SAR 600। ওই payment reverse হলে outstanding আবার SAR 1000 হতে পারে।

# ৪৩ | Purchase Prices: কেনার দামের ইতিহাস

**কোথায়:** `/inventory/purchase-prices`। Inventory read অনুমতিতে দেখা যায়; পেজে প্রবেশের role সীমা প্রযোজ্য।

## ধাপে ধাপে
১. inventory item ও supplier নির্বাচন করুন।
২. Last purchase price, Previous price, Price variance ও Average actual/fallback দেখুন।
৩. প্রতিটি row-এর effective date, price source, purchase price, normalized base price ও reference দেখুন।
৪. অস্বাভাবিক দামের উৎস PO/receipt/invoice খুলে যাচাই করুন।

## কীভাবে তৈরি হয়
Proposed, approved, received এবং posted-invoice পর্যায়ের দামের ইতিহাস রাখা হয়। প্রতি purchase unit-এর দামকে base unit-এ normalize করে তুলনা করা যায়। এটি append-only history; পুরোনো দামের record প্রতিস্থাপন করার form নয়।

## নিয়ম
Draft/proposed price মানে সত্যি ওই দামে মাল কেনা হয়েছে নয়। Reorder-এর price source দেখে বুঝুন সেটি posted invoice, receipt, approved অথবা fallback কোন তথ্য। Procurement Settings অস্বাভাবিক price increase warning/block নিয়ন্ত্রণ করে।

**নমুনা:** carton-এর size 10 kg থেকে 12 kg হলে শুধু carton price তুলনা বিভ্রান্তিকর; প্রতি kg normalized price মিলিয়ে দেখুন।

# ৪৪ | Reorder Suggestions: কী পরিমাণ কিনবেন

**কোথায়:** `/inventory/reorder-suggestions`। **Review/Recalculate:** Admin/Manager/Inventory/Storekeeper। **Generate draft PO:** Admin/Manager।

## ধাপে ধাপে
১. Stock Item-এ Smart reorder, supplier, reorder/target/safety ও lead time ঠিক করুন।
২. Recalculate দিন; critical shortage, missing configuration ও stale count দেখুন।
৩. item খুলে calculation breakdown দেখুন। Usable on-hand, confirmed inbound, demand ও target পড়ুন।
৪. Review-এ quantity/supplier/price বদলালে কারণ দিন।
৫. Admin/Manager selected eligible suggestion থেকে Generate draft PO করবেন; supplier অনুযায়ী খসড়া হতে পারে।

## নিয়ম
Projected availability-তে usable stock এবং Ordered/Partially received PO-এর বাস্তব outstanding inbound বিবেচিত হয়। Closed Short future inbound নয়। নির্ভরযোগ্য usage থাকলে demand/lead time ব্যবহৃত হয়। Suggestion quantity purchase unit-এ; হিসাব base unit-এ। MOQ/order multiple অনুযায়ী rounding লাগে।

Stale suggestion convert হয় না; আগে recalculate করুন। Snooze action বর্তমান UI-তে কারণসহ ৭ দিন। Generated PO draft; approval, order ও receiving বাকি। Stock Item-এর custom MOQ save সীমা অধ্যায় ৩৬ দেখুন।

**নমুনা:** saleable stock কমলেও physical stock বেশি থাকতে পারে; reorder physical stock-কে usable ধরে নেয় না।

# ৪৫ | Purchasing Actions: করণীয়গুলোর তালিকা

**কোথায়:** `/inventory/purchasing-actions`। **দেখেন:** অনুমতিপ্রাপ্ত inventory roles; Accountant page restriction প্রযোজ্য। **পরিচালনা:** Admin/Manager।

## ধাপে ধাপে
১. Scan conditions দিয়ে বর্তমান শর্তগুলো পুনরায় যাচাই করান।
২. severity, state ও search filter দিয়ে কাজ সাজান।
৩. action-এর explanation, detected/due date ও related record দেখুন।
৪. Open record দিয়ে মূল PO, invoice, reorder বা সংশ্লিষ্ট record-এ যান।
৫. প্রয়োজনে Acknowledge, Snooze 24h অথবা কারণসহ Resolve দিন।

## state বোঝা
Open মানে করণীয় আছে। Acknowledged মানে কেউ দেখেছেন। Snoozed মানে সাময়িক স্থগিত। Resolved মানে workflow-তে নিষ্পত্তি হিসেবে চিহ্নিত; উৎস সমস্যার বাস্তব অবস্থা আলাদা করে নিশ্চিত করতে হবে।

## নিয়ম
Action Center-এ Resolve চাপা PO approve, stock receive বা invoice payment করে না। সমস্যার মূল record-এ কাজ সম্পন্ন করুন। শর্ত বহাল থাকলে scan-এর ফলে আবার প্রয়োজনীয় attention দেখা যেতে পারে। Inventory/Storekeeper state পরিবর্তনের অধিকার পান না।

**নমুনা:** overdue invoice action acknowledge করলে outstanding শূন্য হয় না; invoice payment record সম্পন্ন করতে হবে।

# ৪৬ | Stock In, Stock Out ও Adjustment

**কোথায়:** `/inventory/stock-in` ও `/inventory/stock-out`। **কারা:** inventory write অনুমতিপ্রাপ্ত roles।

## উদ্দেশ্য ও স্বাভাবিক ধাপ
১. Stock In, Stock Out, Waste, Damaged অথবা Adjust Stock-এর প্রযোজ্য ধরন নিন।
২. item নির্বাচন করুন। Stock In-এ purchase quantity, cost, supplier, lot ও date/expiry দিন।
৩. Stock Out/Waste/Damaged-এ base quantity; Adjustment-এ নতুন চূড়ান্ত base balance দিন।
৪. কারণ ও notes দিন। Record movement-এর পরে before/after stock ও transaction পরীক্ষা করুন।

## quantity-এর পার্থক্য
বর্তমান stock 20 kg থেকে বাস্তবে 17 kg হলে Adjustment quantity `17`; কমতির `3` নয়। Stock Out-এ 3 দিলে 3 kg কমবে। Stock In-এর purchase conversion আলাদা; unit দেখে লিখুন।

## বর্তমান কার্যকর সীমাবদ্ধতা
পর্যালোচিত `validateMovementPayload`-এ undefined `partial` ও `result` ব্যবহৃত হয়েছে। বৈধ manual movement-ও সংরক্ষণের আগে server error-এ আটকে যেতে পারে। Stock In/Out/Adjustment এবং এই একই form-এর Waste/Damaged-এ প্রভাব পড়তে পারে। এটি চালিয়ে live পরীক্ষা করা হয়নি; কোডে পাওয়া বাধা।

> ত্রুটি হলে বারবার submit করবেন না। Admin/প্রযুক্তিগত দায়িত্বপ্রাপ্তকে জানান এবং history মিলিয়ে নিন। PO Receive, dedicated Waste / Damaged ও Inventory Count ভিন্ন workflow; শুধু error এড়াতে ভুল ধরনের transaction ব্যবহার করবেন না।

# ৪৭ | Stock Movements: সব পরিবর্তনের খাতা

**কোথায়:** `/inventory/stock-movements`। এখানে movement দেখা হয়; history সরাসরি edit করার পেজ নয়।

## ধাপে ধাপে
১. transaction ID/reference/search এবং movement type, item, user, From/To date দিয়ে খুঁজুন।
২. quantity, Stock before, Stock after, batch, reason ও performed by পড়ুন।
৩. linked order/PO/reference থাকলে উৎস record মিলিয়ে নিন।
৪. Refresh, Clear এবং pagination ব্যবহার করুন। Export CSV দিয়ে প্রয়োজনীয় তালিকা তুলুন।

## কী কী দেখা যায়
Opening Balance, Stock In/Out, Adjustment, Purchase Receipt, Waste/Damaged, count adjustment এবং sale/return-সংশ্লিষ্ট movement থাকতে পারে। Movement-এর ধরন ও reference দিয়ে কারণ বোঝুন।

## নিয়ম
History-তে সব quantity একইভাবে ব্যাখ্যা করবেন না; type ও before/after দেখুন। Sale-এর stock deduction manual ব্যবহার হিসেবে আবার লিখবেন না। Export-এর আগে filter ও page পরীক্ষা করুন; UI CSV-তে বর্তমানে লোড হওয়া rows ব্যবহৃত হতে পারে।

**নমুনা:** 10 → 8 kg এবং order reference থাকলে recipe deduction হতে পারে। একই order-এর জন্য আবার 2 kg manual Stock Out দিলে দ্বিগুণ কমবে।

# ৪৮ | Waste / Damaged: নষ্ট মাল

**কোথায়:** `/inventory/waste-damaged`। এটি আলাদা loss form; Stock Out-এর embedded Waste form-এর সঙ্গে এক নয়।

## ধাপে ধাপে
১. নতুন waste record খুলুন; WASTE বা DAMAGED নির্বাচন করুন।
২. item ও শূন্যের বেশি base-unit quantity দিন।
৩. reason নির্বাচন করুন: Spoiled, Expired, Broken, Damaged package, Spillage, Overcooked বা Other।
৪. occurred date/time ও notes দিন।
৫. cost impact preview দেখে save করুন; movement ও stock balance পরীক্ষা করুন।

## নিয়ম ও ফলাফল
Loss record physical stock কমায় এবং movement/audit রাখে। ভবিষ্যতের loss date দেওয়া যায় না; সামান্য clock tolerance ছাড়া server বাধা দেয়। পর্যাপ্ত stock না থাকলে যথাযথ validation প্রযোজ্য। Loss preview হিসাবের সহায়তা; sales refund নয়।

Expired batch বিক্রিতে অযোগ্য হলেও গুদামে physically থাকতে পারে। Disposal নথিভুক্ত করতে authorized loss process দরকার; expiry list থেকে date গায়েব করলেই disposal হয় না।

**পরামর্শ:** expiry/lot-ভিত্তিক ক্ষতি হলে notes-এ প্রকৃত lot ও disposal-এর কারণ লিখুন এবং record-এর allocation মিলিয়ে নিন।

**নমুনা:** 2 kg নষ্ট chicken-এর জন্য WASTE + Spoiled লিখলে physical stock 2 kg কমবে; কোনো customer refund হবে না।

# ৪৯ | Recipes ও Add-on Recipes

**কোথায়:** `/inventory/recipes` → Menu Item Recipes / Add-on Recipes। **লেখেন:** inventory writers।

## ধাপে ধাপে
১. menu item বা add-on নির্বাচন করুন।
২. Add ingredient দিয়ে active inventory item ও Quantity per sale / Qty per add-on দিন।
৩. base unit, physical/saleable stock ও ingredient cost দেখুন।
৪. ingredient/recipe Active রাখুন; Save করুন।
৫. ইচ্ছাকৃত untracked item হলে শুধু তখন Do Not Track নির্বাচন করে save করুন। Export Recipes দিয়ে mapping তুলতে পারেন।

## নিয়ম
প্রতিটি sold menu item, combo component ও selected physical add-on-এর valid active recipe লাগে, যদি saved Do Not Track না থাকে। Missing/inactive/empty recipe অথবা সব ingredient disabled হলে sale block। Ingredient unique, active, positive quantity এবং item-এর base unit-এ হতে হবে।

Cost preview ingredient cost-এর সারসংক্ষেপ; restaurant-এর পূর্ণ লাভ নয়। Add-on quantity ও combo multiplier deduction-এ অংশ নেয়।

> Menu item-এর Ingredients লেখা বা Kitchen Recipe Instructions stock mapping-এর বিকল্প নয়। Do Not Track স্টকের ঘাটতি লুকানোর জন্য ব্যবহার করবেন না।

**নমুনা:** burger-পিছু chicken 0.15 kg হলে 4 burger-এ 0.60 kg; cheese add-on-এর ingredient আলাদাভাবে যোগ হবে।

# ৫০ | Inventory Count: হাতে গুনে stock মিল

**কোথায়:** `/inventory/inventory-count`। **তৈরি/জমা:** inventory writers। **অনুমোদন/complete/recount/cancel:** Admin/Manager।

## ধাপে ধাপে
১. Start inventory count-এ All active inventory items অথবা category নিন।
২. notes ও প্রয়োজন হলে Blind count নির্বাচন করুন।
৩. প্রতিটি line-এ physically counted base-unit quantity দিন; শূন্য বৈধ।
৪. Inventory/Storekeeper Submit for approval করবেন। Admin/Manager Complete count & adjust stock করতে পারেন।
৫. review-required record-এ conflict না থাকলে Approve; conflict থাকলে Review & recount দিয়ে নতুন snapshot নিয়ে আবার গুনুন।

## নিয়ম ও ফলাফল
Count শুরুতে expected stock snapshot থাকে। Count-এর মাঝে stock বদলালে পুরোনো expected ধরে adjustment করা নিরাপদ নয়; conflict review দরকার। অনুমোদিত completion variance অনুযায়ী audited stock movement তৈরি করে।

Blind count-এ expected/variance entry-এর সময় গোপন থাকে। সব item-এর quantity দিতে হবে; অসম্পূর্ণ sheet সম্পন্ন হয় না। Cancelled/completed count-কে আবার open form হিসেবে ব্যবহার করবেন না।

**নমুনা:** expected 10 kg, counted 9 kg হলে completion-এ -1 kg adjustment হয়। Count জমা দেওয়ামাত্র approval ছাড়া stock বদলেছে ধরে নেবেন না।

# ৫১ | Expiry Tracking ও Low Stock Alerts

**কোথায়:** `/inventory/expiry-tracking` এবং `/inventory/low-stock-alerts`।

## Expiry Tracking-এর ধাপ
১. item, affected batch/lot, quantity, expiry date ও location দেখুন।
২. Expired আর Expiring soon আলাদা করুন।
৩. Batches-এ গিয়ে lot ও eligibility যাচাই করুন।
৪. বাস্তবে নষ্ট/মেয়াদোত্তীর্ণ হলে সঠিক disposal/loss workflow অনুসরণ করুন।

## Low Stock-এর ধাপ
১. current stock, reorder level, suggested amount ও supplier দেখুন।
২. Stock Items/Recipes-এ saleable stock-ও মিলিয়ে নিন।
৩. প্রয়োজন হলে Reorder Suggestions recalculate ও PO workflow শুরু করুন।

## নিয়ম
Alert দেখা, Refresh বা report export কোনো stock সরায়/বাড়ায় না। Low stock summary ও smart reorder আলাদা দৃষ্টিভঙ্গি দিতে পারে; smart reorder-এ usable stock, demand এবং confirmed inbound থাকে। Expiry alert window Inventory Settings থেকে নির্ধারিত হয়।

Riyadh expiry day-এর পুরো দিন বৈধ থাকার নিয়ম প্রযোজ্য। Missing expiry বা batch mismatch থাকলে শুধু “Expired নয়” দেখে saleable ধরে নেবেন না।

**নমুনা:** দুই দিন পর expiry থাকা batch আগে ব্যবহারযোগ্য হতে পারে; কিন্তু damaged quality হলে FEFO-তেও বিক্রি হবে না।

# ৫২ | Inventory Reports ও CSV export

**কোথায়:** `/inventory/reports`।

| রিপোর্ট | কী কাজে লাগে |
| --- | --- |
| Inventory Valuation | stock-এর মূল্য, Batch/Fallback method, missing cost ও quantity mismatch দেখা। |
| Stock Movement | stock পরিবর্তন, balance, reason ও user দেখা। |
| Purchases | PO, supplier, status ও purchase total দেখা। |
| Waste / Loss | অপচয়/ক্ষতির transaction দেখা। |
| Low Stock / Expiry | ঘাটতি ও মেয়াদের operational list। |
| Supplier Purchase History | supplier অনুযায়ী PO/purchase history। |

## ধাপে ধাপে
১. report type নির্বাচন করুন।
২. Movement/Purchases/Waste/Supplier report-এ From/To ব্যবহার করুন; Supplier report-এ supplier filter দিন।
৩. Refresh ও pagination দিয়ে তথ্য দেখুন।
৪. Export CSV দিয়ে বর্তমানে লোড হওয়া report rows সংরক্ষণ করুন। বড় রিপোর্টের পরের page-ও প্রয়োজন কি না পরীক্ষা করুন।

## নিয়ম
এই পেজে সব report-এর জন্য native PDF export নেই; browser print আলাদা। Valuation batch coverage অসম্পূর্ণ হলে সতর্কতা পড়ে ব্যবহার করুন। Purchase order total মানে paid amount নয়। Inventory value মানে sale value বা net profit নয়।

**নমুনা:** “Qty mismatch” row থাকলে শুধু summary total নিয়ে stock certificate তৈরি করার আগে item/batch মিলিয়ে নিন।

# ৫৩ | Inventory Settings

**কোথায়:** `/inventory/settings`। **কারা:** Admin/Manager।

## ধাপে ধাপে
১. Outlet name ও Expiry alert window দিন। Alert window ১-৩৬৫ days। Currency SAR নির্ধারিত; এই form থেকে বদলায় না।
২. Purchasing automation-এ demand lookback, default lead time, default safety stock, stale-after hours, snooze days ও due-soon window দিন।
৩. Default allow negative stock প্রয়োজন বুঝে নির্ধারণ করুন।
৪. Save settings দিয়ে পুনরায় displayed value পরীক্ষা করুন।

## অগ্রাধিকার ও সীমা
Item/supplier-এর নির্দিষ্ট মান থাকলে প্রযোজ্য ক্ষেত্রে global fallback-এর আগে সেটি ব্যবহৃত হয়। Reorder quantity, lead-time demand, stale suggestion ও payable attention-এ policy প্রভাব ফেলতে পারে।

Form-এ Allow negative stock by default থাকলেও সব sale/receipt/adjustment এই একটি switch দিয়ে অনুমোদিত হয়ে যায় না। প্রতিটি operation-এর নিজস্ব validation থাকে। স্বাভাবিক কাজে stock availability আগে মিলিয়ে নিন।

## Google Sheets sync
পেজে Not connected দেখানো আছে। বর্তমান stock-এর source of truth প্রজেক্টের inventory database; Google Sheets-এ স্বয়ংক্রিয় sync চলছে ধরে নেবেন না। CSV export ও live sync আলাদা।

**পরামর্শ:** global setting বদলানোর পরে suggestion recalculate ও affected alert refresh করে ফল পরীক্ষা করুন।

# ৫৪ | Admin থেকে অন্য workspace-এর লিংক

## Kitchen Display
Sidebar → `/kitchen`। Admin/Manager/Kitchen order queue, preparation ও ready workflow চালান। Kitchen-এর অনুমোদিত status Confirmed/Preparing/Ready। এটি payment collection-এর পেজ নয়। Scheduled kitchen release সময় প্রযোজ্য।

## Recipe Instructions
Sidebar → `/kitchen/recipes`। রান্নার পদ্ধতি/জ্ঞানভিত্তিক instruction workspace। `/inventory/recipes` ingredient deduction mapping-এর কাজ করে; দুটি আলাদা। Instruction থাকলেই stock recipe configured হয় না।

## Rider Portal
Admin-এর sidebar link → `/rider`। Rider-এর নিজস্ব delivery assignment, pickup, delivery ও cash report workspace। Admin management `/admin/deliveries` থেকে হয়। Rider operational feature সক্রিয় আছে কি না setting ও permission অনুযায়ী দেখুন।

## Tips & Tricks
`/tips-and-tricks` কাজ শেখার knowledge page। নিজের role-এ যেটুকু content অনুমোদিত সেটুকু পাবেন। এটি setting পরিবর্তন বা লেনদেনের form নয়।

## View Restaurant ও Customer Display
View Restaurant দিয়ে public site খুলে menu/content পরিবর্তনের প্রকাশ দেখুন। POS-এর `/pos/customer-display` customer-facing display; cashier action ও payment confirmation মূল POS-এ হয়।

> বাইরের workspace-এ যাওয়ার লিংক দেখা মানেই সব action-এর অনুমতি পাওয়া নয়। এই বইয়ের detailed ধাপ Admin ও Inventory-কেন্দ্রিক।

# ৫৫ | শুরু থেকে শেষ: চারটি কাজের উদাহরণ

## উদাহরণ ১: নতুন খাবার চালু
১. Admin Menu Category তৈরি → Menu Item save।
২. Inventory category/supplier/item তৈরি → unit ও cost ঠিক।
৩. সঠিক receipt-এ usable batch আনুন।
৪. Menu Item Recipe ও physical Add-on Recipe save।
৫. availability ও price দেখে অনুমোদিত বিক্রয় করুন; order ও movement মিলিয়ে নিন।

## উদাহরণ ২: মাল কেনা ও supplier-কে টাকা
Draft PO → Submit → Approve → Mark ordered → Receive actual quantity → Supplier Invoice → Submit/Review → Approve → Post → বাস্তব payment → Record payment।

**মনে রাখুন:** PO-তে stock বাড়ে না; Receive-এ বাড়ে। Invoice stock আবার বাড়ায় না; payment outstanding কমায়।

## উদাহরণ ৩: নষ্ট মাল ও count
Lot যাচাই → Waste/Damaged record → movement পরীক্ষা → প্রয়োজন হলে নতুন Count শুরু → হাতে গুনে quantity → approval/complete। একই ঘাটতি waste ও count-এ দুবার বাদ পড়ছে কি না মিলিয়ে নিন।

## উদাহরণ ৪: live delivery ও cash
Existing eligible order → enrollment → food Ready → rider assignment → pickup → delivered → rider cash report → cashier বাস্তবে টাকা নিয়ে confirm। এতে দ্বিতীয় sale বা দ্বিতীয় recipe deduction তৈরি করার প্রয়োজন নেই।

> সব উদাহরণে কাজের আগে বিদ্যমান record খুঁজে duplicate entry এড়ান।

# ৫৬ | সংশোধন, archive ও পুনরায় submission

| কাজ | ফলাফল ও নিয়ম |
| --- | --- |
| Item/supplier archive | inactive করে; পুরোনো stock/purchase history রেখে দেয়। |
| Expense archive | active list থেকে আড়াল; বৈধ expense report-এ থাকে। |
| Expense cancel | unpaid হলে কারণসহ; paid/partially paid বন্ধ। |
| PO Closed Short | বাকি inbound বন্ধ; stock receipt বানায় না। |
| Invoice Void | reservation মুক্ত; completed payment থাকলে আগে reverse। |
| Review delete | স্থায়ী অপসারণ; confirmation পড়তে হবে। |
| Restock | শুধু প্রযোজ্য return workflow ও বাস্তব ফেরতের অনুমোদনে। |

## retry-এর সাধারণ নিয়ম
১. প্রথমে সফলতার বার্তা, record ID ও history দেখুন।
২. ফল unknown হলে form যে original request recovery দেয় সেটি ব্যবহার করুন।
৩. একই ঘটনার নতুন payload/key বা নতুন record বানানোর আগে আগের ফল নির্ধারণ করুন।
৪. “Record changed”/409 এলে বর্তমান record refresh ও review করুন। Receipt-এর payload-conflict হলে original submission-এর নির্দেশ আলাদা করে মানুন।

**পরামর্শ:** reason-এ ঘটনা স্পষ্ট লিখুন। প্রমাণ মেলানোর জন্য record number ব্যবহার করুন; ধারাবাহিক ID-এর ফাঁক পূরণ করতে কোনো রেকর্ড বানাবেন না।

# ৫৭ | সমস্যা হলে কোথা থেকে শুরু করবেন

| সমস্যা | প্রথমে কী দেখবেন |
| --- | --- |
| Page access denied | নিজের role, active account ও নির্দিষ্ট পেজের অনুমতি। Accountant inventory সীমা মনে রাখুন। |
| Sale-এ insufficient stock | physical নয়, usable/saleable balance, expiry, quality ও recipe quantity। |
| Recipe not configured | মূল item, combo-র প্রতিটি component এবং selected add-on recipe। |
| PO approve হয় না | Submitted status, role, total threshold, approval revision ও self-approval rule। |
| Receive আটকে যায় | selected positive quantity, remaining/cumulative cap, manager reason বা pending original submission। |
| Invoice mismatch | supplier/PO line, actual received, অন্য invoice commitment, price ও tolerance। |
| Payment হয় না | invoice Posted কি না, outstanding, threshold, pending original request। |
| Count conflict | count শুরুর পরে stock বদলেছে কি না; Manager review/recount। |
| Stale / unavailable data | last successful update, connection এবং Refresh/Retry। শূন্য বলে সিদ্ধান্ত নয়। |
| Manual stock movement server error | অধ্যায় ৪৬-এর বর্তমান validation ত্রুটি; repeated submit নয়, দায়িত্বপ্রাপ্তকে জানান। |

## দায়িত্বপ্রাপ্তকে যা দেবেন
পেজের নাম, record ID, কাজের সময় (Riyadh), কী করতে চেয়েছিলেন এবং exact error message লিখুন। Password, PIN বা অপ্রয়োজনীয় customer contact পাঠাবেন না।

# ৫৮ | দৈনিক ও সাপ্তাহিক চেকলিস্ট

## দিনের শুরু
১. নিজের account ও terminal মিলিয়ে sign in করুন।
২. Dashboard-এর pending/preparation attention ও last update দেখুন।
৩. প্রয়োজনে opening cash দিয়ে POS shift খুলুন।
৪. expired/blocked/low saleable stock এবং missing recipe দেখুন।
৫. আগের দিনের unfinished delivery, pending receipt ও unknown submission পরীক্ষা করুন।

## কাজের সময়
১. stock receive-এর আগে PO ও বাস্তব delivery মিলিয়ে নিন।
২. supplier invoice number দিয়ে duplicate খুঁজুন।
৩. waste ও correction সঙ্গে সঙ্গে কারণসহ লিখুন।
৪. rider-reported cash ও cashier confirmation আলাদা রাখুন।
৫. failure হলে নতুন record তৈরির আগে original request recovery পরীক্ষা করুন।

## দিনের শেষ
১. cash গুনে shift close; variance থাকলে reason/approval নিন।
২. pending/held sale এবং cash report review করুন।
৩. stock movement ও বড় loss/adjustment মিলিয়ে নিন।
৪. Logout/Lock ব্যবহার করুন।

## সাপ্তাহিক
Reorder recalculate, overdue payable review, supplier price তুলনা, targeted inventory count, attendance/leave review এবং archived history-সহ report মিলিয়ে দেখুন।

> এগুলো কাজের পরামর্শ। সফটওয়্যারের বাধ্যতামূলক validation-এর অতিরিক্ত স্বয়ংক্রিয় নিয়ম হিসেবে ধরে নেবেন না।

# ৫৯ | সাধারণ প্রশ্ন ও সহজ শব্দার্থ

## সাধারণ প্রশ্ন
**Stock আছে, তবু sale বন্ধ কেন?** Batch blocked/expired, expiry missing, কম saleable balance বা invalid recipe হতে পারে।

**PO Ordered মানে মাল এসেছে?** না; Receive-এর পর stock বাড়ে। **Invoice Posted মানে paid?** না; payment আলাদা।

**Physical ingredient লেখা আর recipe এক?** Menu description-এর ingredients এবং stock mapping আলাদা।

**Archive করলে report কমবে?** Expense archive হিসাব থেকে সরায় না। Cancel আলাদা workflow।

**Refund complete মানে stock ফেরত?** শুধু restock অনুমোদিত ও প্রযোজ্য return সম্পন্ন হলে।

**সব CSV-তে সব page থাকে?** নিশ্চিত নয়। Inventory Reports/Movements-এর export বর্তমানে loaded rows ব্যবহার করে; page/filter পরীক্ষা করুন।

## শব্দার্থ
| শব্দ | সহজ অর্থ |
| --- | --- |
| SKU / Lot | stock item-এর স্থায়ী পরিচয় / একটি batch-এর পরিচয়। |
| FEFO | উপযুক্ত stock-এর মধ্যে আগে expiry হওয়া batch আগে ব্যবহার। |
| Base / Purchase unit | হিসাব ও recipe-এর unit / কেনার unit। |
| MOQ / Order multiple | ন্যূনতম কেনার পরিমাণ / যে গুণিতকে quantity হয়। |
| Outstanding / Aging | বাকি টাকা / সেই বকেয়ার বয়স। |
| Idempotent retry | একই মূল request পুনরায় পাঠালেও কাজটি দ্বিতীয়বার না হওয়া। |
| Stale / Unavailable | তথ্য পুরোনো / নির্ভরযোগ্য নতুন তথ্য পাওয়া যায়নি। |

# ৬০ | Status-গুলোর দ্রুত ব্যাখ্যা

| কোথায় | Status ও মানে |
| --- | --- |
| Live order | Pending: অপেক্ষা; Confirmed: গৃহীত; Preparing: রান্না; Ready: প্রস্তুত; Out for delivery: পথে; Delivered: handover সম্পন্ন। |
| Order terminal state | Cancelled/Failed: স্বাভাবিক fulfillment বন্ধ; payment refund আলাদা। |
| Payment | Unpaid/Pending: বাকি; Paid: রেকর্ডকৃত আদায়; Partially refunded/Refunded: completed refund অনুযায়ী অবস্থা; Voided: প্রযোজ্য void। |
| Refund | Requested → Approved → Processing/Completed; Rejected, Cancelled বা Failed আলাদা ফল। Completed-এই actual refund reporting প্রভাব পড়ে। |
| PO | Draft → Submitted → Approved → Ordered → Partially received → Received; Rejected, Cancelled, Closed Short প্রযোজ্য বিকল্প। |
| Supplier invoice | Draft → Submitted/Review Required → Approved → Posted; Disputed review-এর জন্য, Voided বাতিল reservation। |
| Count | In progress: গণনা; Review Required: approval/conflict; Completed: adjustment হয়েছে; Cancelled: বন্ধ। |
| Reorder | Open/Reviewed: বিবেচনাধীন; Dismissed: স্থগিত; Stale: পুরোনো; Converted: draft PO হয়েছে; Resolved: প্রয়োজন মিটেছে। |
| Purchasing action | Open, Acknowledged, Snoozed, Resolved করণীয়ের ব্যবস্থাপনা; উৎস লেনদেনের status নয়। |

> সব status থেকে ইচ্ছেমতো অন্য status-এ যাওয়া যায় না। পেজে পাওয়া পরবর্তী action এবং server validation অনুসরণ করুন।

# ৬১ | বর্তমান সীমাবদ্ধতা ও যাচাইয়ের সীমা

## কোডে পাওয়া নির্দিষ্ট বিষয়
১. Accountant-এর payables permission থাকলেও Inventory page layout তাকে ঢুকতে দেয় না। UI access এবং API permission-এর অমিল।
২. Manual movement validator-এ undefined variable রয়েছে; valid Stock In/Out/Adjustment request-ও error-এ পড়তে পারে। এই বইয়ের ধাপ সম্ভাব্য intended flow; বর্তমান বাধা অধ্যায় ৪৬-এ চিহ্নিত।
৩. Stock Item form-এর custom MOQ ও Order multiple item payload validator রাখে না; default/existing মান কার্যকর থাকতে পারে।
৪. কিছু backend workflow-এর action সাধারণ UI-তে সবসময় প্রকাশিত নয়, যেমন invoice dispute-এর পুরো transition এবং high-value self-approval emergency override।

## চালু বলে ধরা যাবে না
Google Sheets sync connected নয়। Card/gateway payment, aggregator settlement, automatic recurring payment, পূর্ণ payroll, net profit এবং regulatory tax compliance এই বইয়ের বর্ণিত form দিয়ে প্রতিষ্ঠিত হয় না। Included tax field বা receipt print এই সুবিধাগুলোর প্রমাণ নয়।

## কী যাচাই হয়েছে
পেজের navigation, visible fields/actions, role matrix, workflow, quantity/conversion, recipe/batch eligibility, purchasing safety এবং reporting সংজ্ঞা কোড ও নথিতে মিলিয়ে দেখা হয়েছে। PDF-এর বাংলা rendering ও pagination আলাদাভাবে পরীক্ষা করা হয়েছে।

> লাইভ server, deployment settings, প্রকৃত database, browser notification, external terminal বা বাস্তব লেনদেন পরীক্ষা করা হয়নি। কোনো defect ঠিক করা বা application feature পরিবর্তন করা এই কাজের অংশ ছিল না।

# ৬২ | উৎস ও হালনাগাদের নির্দেশনা

## প্রধান উৎস: UI ও অনুমতি
`frontend/src/components/AdminDashboard.jsx`, `admin/AdminShell.jsx`, `inventory/InventoryShell.jsx`, `inventory/InventorySectionPage.jsx`, `frontend/src/security/policy.js`, `frontend/app/inventory/layout.jsx` এবং `backend/config/permissions.js`।

Admin-এর Menu, Combos, Categories, Customers, Offers, Rewards, Blog, Reviews, Orders, POS, Delivery, Staff, Finance ও Settings-এর সংশ্লিষ্ট component এবং API routes পর্যালোচনা করা হয়েছে। Inventory-এর সব ২০টি মূল navigation destination-এর page/form এবং related controller/service দেখা হয়েছে। Tips & Tricks external destination হিসেবে উল্লেখ করা হয়েছে।

## কার্যপ্রবাহের প্রধান উৎস
`backend/config/orderContract.js`; `orderEngineService.js`, `orderPaymentService.js`, `refundService.js`; `purchaseOrderService.js`, `supplierInvoiceService.js`, `reorderService.js`; `inventoryStockService.js`, `inventoryUnitService.js`, `inventoryEligibilityService.js`; `backend/utils/inventoryValidation.js`; item/master data/stock controller এবং সংশ্লিষ্ট model। Service নামগুলো `backend/services/`-এর অন্তর্গত।

## প্রকল্পের ব্যাখ্যামূলক নথি
`docs/STOCK_RECIPE_ACCURACY.md`, `PURCHASING_SUPPLIER_INVOICE_SAFETY.md`, `ADMIN_REPORTING_ACCURACY.md`, `ADMIN_DASHBOARD_PHASE5.md`, `POS_PHASE2.md`, `delivery-management.md`, `delivery-management-redesign.md` ও `rider-cash-workflow.md`। সংক্ষিপ্ত নামের নথিগুলোও `docs/`-এর অন্তর্গত। বর্তমান code/UI-এর সঙ্গে মিলিয়ে নথি ব্যবহার করা হয়েছে।

## ভবিষ্যতে বই বদলাবেন যেভাবে
সঙ্গে দেওয়া Markdown মূল ফাইলে সংশ্লিষ্ট অধ্যায় বদলান। Role, field, status, stock/payment effect ও limitation মিলিয়ে update করুন; তারিখ ও version বাড়ান। Builder চালিয়ে নতুন PDF বানালে সূচিপত্র ও পৃষ্ঠা নম্বর নতুন করে তৈরি হয়। পরিবর্তিত PDF আবার render করে বাংলা, table ও page break পরীক্ষা করুন।
