import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Beauty from Ashes" },
      {
        name: "description",
        content:
          "Plain-language terms of use for the Beauty from Ashes private beta.",
      },
      { property: "og:title", content: "Terms of Use — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Plain-language terms of use for the Beauty from Ashes private beta.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms apply to your use of Beauty from Ashes, a private beta
        offered by Resurgence Therapeutics. They are written in plain language.
        They are not legal advice.
      </p>

      <h2 className="font-serif text-xl">Who this is for</h2>
      <p>
        Beauty from Ashes is intended for adults age 18 and older, unless
        Resurgence Therapeutics later says otherwise.
      </p>

      <h2 className="font-serif text-xl">What this app is</h2>
      <p>
        Beauty from Ashes is an educational, reflective and spiritually
        sensitive self-help resource. It is intended to accompany daily
        practice and reflection.
      </p>

      <h2 className="font-serif text-xl">What this app is not</h2>
      <p>
        Beauty from Ashes is not psychotherapy, counselling, medical care,
        diagnosis, treatment, crisis intervention or an emergency service.
        Using the app does not create a therapist-client, health-care-provider,
        pastoral-care, fiduciary or other professional relationship with Carl
        Wycliffe Hicks Jr., Resurgence Therapeutics, or any contributor to the
        app.
      </p>

      <h2 className="font-serif text-xl">Your own care and safety</h2>
      <p>
        You remain responsible for your own decisions, safety and for seeking
        qualified professional care when you need it. If an exercise increases
        distress or feels unsafe for you, please stop, use the Pause and Ground
        practice, and seek appropriate support.
      </p>

      <h2 className="font-serif text-xl">No guarantee of outcomes</h2>
      <p>
        Every person is different. The app does not guarantee healing,
        symptom improvement, accuracy for every situation, uninterrupted
        availability, or any particular outcome.
      </p>

      <h2 className="font-serif text-xl">Content and intellectual property</h2>
      <p>
        The written reflections, teachings, exercises, structure, visual design
        and other content of Beauty from Ashes are protected intellectual
        property of Resurgence Therapeutics and its contributors. Content is
        made available for your personal, non-commercial use only.
      </p>
      <p>
        Without prior written permission, you may not copy, resell,
        redistribute, republish or use the content to train machine-learning
        systems. Ordinary personal sharing of a public link to the app is
        permitted.
      </p>

      <h2 className="font-serif text-xl">Third-party links and resources</h2>
      <p>
        The app may link to third-party websites, videos and support services
        for your convenience. Resurgence Therapeutics does not control those
        resources and does not endorse every aspect of them.
      </p>

      <h2 className="font-serif text-xl">Changes</h2>
      <p>
        The app and these terms may change over time. When changes are
        significant, the “last updated” date at the top of this page will
        change.
      </p>

      <h2 className="font-serif text-xl">Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Resurgence Therapeutics, Carl
        Wycliffe Hicks Jr., and contributors to the app are not responsible for
        indirect, incidental, special, consequential or punitive losses
        arising out of your use of, or inability to use, the app. Nothing in
        these terms is intended to exclude or limit any right or remedy that
        cannot legally be excluded or limited.
      </p>

      <h2 className="font-serif text-xl">Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of Ontario and
        the laws of Canada that apply there, without regard to conflict-of-laws
        rules. This statement is provided for clarity and is not legal advice.
      </p>
    </LegalPage>
  );
}
