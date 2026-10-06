import React, { useState } from 'react';
import { Plus } from 'lucide-react';

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What's the difference between a deep clean and a standard clean?",
    answer:
      'Standard cleaning keeps your home consistently fresh - surfaces, floors, bathrooms, and bins on a regular rhythm. A deep clean goes further: detail on skirtings, inside appliances and cupboards where agreed, limescale and grout, and areas that do not get attention every week. Think maintenance versus full reset.',
  },
  {
    question: 'How long does a deep clean take?',
    answer:
      'It depends on property size, condition, and the scope we agree. Smaller flats may take a few hours; larger homes or post-renovation jobs can take a full day or more. We give you a realistic time estimate when you book so you can plan around access.',
  },
  {
    question: 'Do I need to be home during the clean?',
    answer:
      'Not necessarily. Many clients provide secure access (key safe, concierge, or code) so our team can work while you are out. If you prefer to be home, we will schedule a window that suits you.',
  },
  {
    question: 'Do you bring your own cleaning products and equipment?',
    answer:
      'Yes. CiN teams arrive with professional-grade products and equipment suited to different surfaces. If you need hypoallergenic or specific products, tell us when you book.',
  },
  {
    question: 'How often should I book a deep clean?',
    answer:
      'Most households book a deep clean a few times a year - often seasonally, after building work, before a big event, or between tenants. Heavily used kitchens and bathrooms may benefit from more frequent deep attention.',
  },
  {
    question: 'Are your cleaners insured and background-checked?',
    answer:
      'Yes. Our operatives are vetted and work under CiN’s insurance and safety standards so you can book with confidence.',
  },
  {
    question: 'Do you offer deep cleaning in both London and Manchester?',
    answer:
      'Yes. We serve customers across London and Greater Manchester. Enter your postcode when you book and we will confirm coverage and routing.',
  },
];

type CleaningFaqProps = {
  /** When false, only the accordion list is shown (e.g. FAQ page supplies the page title above). */
  showSectionTitle?: boolean;
};

/**
 * Dark accordion FAQ - black panel, rounded rows, + control (CiN marketing style).
 */
const CleaningFaq: React.FC<CleaningFaqProps> = ({ showSectionTitle = true }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      className="bg-black py-14 md:py-20"
      aria-labelledby={showSectionTitle ? 'cleaning-faq-heading' : undefined}
    >
      <div className="max-w-2xl mx-auto px-4 lg:px-8">
        {showSectionTitle && (
          <h2 id="cleaning-faq-heading" className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-8">
            Frequently asked questions
          </h2>
        )}
        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={item.question}
                className="rounded-2xl border border-zinc-700/90 bg-zinc-950/90 overflow-hidden transition-colors hover:border-zinc-600"
              >
                <button
                  type="button"
                  id={`cleaning-faq-q-${index}`}
                  aria-expanded={isOpen}
                  aria-controls={`cleaning-faq-a-${index}`}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 sm:px-5 sm:py-4 text-left text-white font-semibold text-sm sm:text-base leading-snug"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <span className="min-w-0 pr-2">{item.question}</span>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-500/80 text-white"
                    aria-hidden
                  >
                    <Plus
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                      strokeWidth={2}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`cleaning-faq-a-${index}`}
                    role="region"
                    aria-labelledby={`cleaning-faq-q-${index}`}
                    className="border-t border-zinc-800 px-4 pb-4 pt-0 sm:px-5 text-sm sm:text-base text-zinc-300 leading-relaxed"
                  >
                    <p className="pt-3">{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CleaningFaq;
