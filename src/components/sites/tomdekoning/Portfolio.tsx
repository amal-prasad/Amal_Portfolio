"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { initMotion } from "./motion";
import "./site.css";

const ASSETS = "/sites/tomdekoning";

const profile = {
  name: "Amal Prasad",
  company: "AGP Enterprises",
  tagline: "I blend marketing, design and tech to build brands people remember.",
  stats: [
    ["Services", "Marketing, design &\ntech solutions"],
    ["Experience", "5 years"],
    ["Timezone", "GMT+5:30"],
    ["Availability", "Freelance"],
    ["Role", "Entrepreneur"],
  ],
  about:
    "I’m Amal Prasad, a freelance entrepreneur representing AGP Enterprises. For 5 years I’ve brought marketing, design and tech solutions together to build brands that stand out and stay consistent wherever they show up. From the idea behind the brand to the identity, website and everything around it. One vision. The right people. A brand that works as one.",
  work: [
    { title: "AGP Enterprises", kind: "Identity / website", file: "agp-enterprises" },
    { title: "RS Jewellers", kind: "Website", file: "rs-jewellers" },
    { title: "Untouch", kind: "Website", file: "untouch" },
  ],
};

/** Source swaps every "o" in headings to italic Playfair. */
function O({ children }: { children: string }): ReactNode {
  return children.split(/([oO])/).map((part, i) =>
    /^[oO]$/.test(part) ? <span key={i} className="playfair-o">{part}</span> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Portfolio() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? initMotion(root.current) : undefined), []);

  return (
    <div ref={root} className="tdk">
      <div className="page-wrapper">
        <section id="header" className="padding-global">
          <div data-sequence-wrap="" className="image-sequence__wrap">
            <div className="image-sequence__sticky">
              <div className="scroll-col">
                <div data-sequence-element="" className="image-sequence__element">
                  <canvas
                    data-sequence-canvas=""
                    data-src={`${ASSETS}/sequence/frame-`}
                    data-filetype="jpg"
                    data-frames="49"
                    data-digits="3"
                    data-index-start="1"
                    className="image-sequence__canvas"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="section__header">
            <div data-reveal-group="" className="header-top">
              <h6 className="text-color-orange"><O>{profile.company}</O></h6>
              <h6 className="text-color-orange"><O>portfolio 2026</O></h6>
            </div>
            <div className="header-bottom">
              <div data-reveal-group="" className="header-intro__wrap">
                <h6 className="hide-mobile-landscape">Hi there</h6>
                <div className="header-text-wrapper">
                  <div className="star-icon">
                    <svg width="42" height="48" viewBox="0 0 42 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 0L22.1089 20.2315C22.1536 21.0354 23.0188 21.5299 23.7418 21.1641L42 11.999L24.8507 23.0654C24.1683 23.5036 24.1683 24.4924 24.8507 24.9346L42 36.001L23.7418 26.8359C23.0147 26.4701 22.1536 26.9646 22.1089 27.7685L21 48L19.8911 27.7685C19.8464 26.9646 18.9812 26.4701 18.2582 26.8359L0 35.997L17.1493 24.9306C17.8317 24.4924 17.8317 23.5036 17.1493 23.0614L0 11.999L18.2582 21.1641C18.9853 21.5299 19.8464 21.0354 19.8911 20.2315L21 0Z" fill="#F34213" />
                    </svg>
                  </div>
                  <p>{profile.tagline}</p>
                </div>
              </div>
              <div className="line" />
              <h1 data-stagger-char-delay="0.75" data-scroll-speed="0.1" data-stagger-char="line" className="text-align-right">
                <O>{profile.name}</O>
                <br />
                <span className="text-color-orange">.AGP</span>
              </h1>
            </div>
          </div>

          <div id="info" className="section__info">
            <div className="_2-col is-intro">
              <h6><O>About</O></h6>
              <div className="flex-vertical space-between is-stretch">
                <div data-reveal-group="" className="flex-vertical">
                  {profile.stats.map(([label, value]) => (
                    <div key={label} className="stats-wrapper">
                      <h6><O>{label}</O></h6>
                      {label === "Timezone" ? (
                        <h6 data-timezone="Asia/Kolkata" data-timezone-label={value}>{value}</h6>
                      ) : (
                        <h6 className="text-align-right stat-value"><O>{value}</O></h6>
                      )}
                      <div className="line is-top" />
                    </div>
                  ))}
                </div>
                <a href="#work" className="button-097">
                  <span className="button-097__hover">
                    <span className="button-097__bg is--hover" />
                    <span className="button-097__inner"><span className="button-097__text">Click here</span></span>
                  </span>
                  <span aria-hidden="true" className="button-097__default">
                    <span className="button-097__bg is--default" />
                    <span className="button-097__inner"><span className="button-097__text">View work</span></span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="padding-global">
          <div className="padding-vertical padding-xxhuge">
            <div className="margin-bottom margin-large">
              <h2 data-gradient-wave-text="" className="heading-2"><O>I build brands that turn heads — online and beyond</O></h2>
            </div>
            <div className="line" />
            <div className="margin-top margin-medium">
              <div data-reveal-group="" className="_2-col is-3-9">
                <h6><O>Because</O></h6>
                <p className="text-2-col">{profile.about}</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="padding-global">
            <div className="margin-top margin-huge work-intro">
              <h6><O>What you’re here for (I guess)</O></h6>
              <h2 data-stagger-char="" className="heading-extreme">Work</h2>
            </div>
          </div>
        </section>

        <section id="work" data-glass-carousel="" data-scroll-speed="-0.2" className="glass-carousel">
          <canvas aria-hidden="true" data-glass-carousel-canvas="" className="glass-carousel__canvas" />
          <div className="glass-carousel__collection">
            <div data-glass-carousel-list="" className="glass-carousel__list">
              {profile.work.map(item => (
                <div key={item.file} data-glass-carousel-item="" className="glass-carousel__item">
                  <video
                    src={`${ASSETS}/work/${item.file}.mp4`}
                    poster={`${ASSETS}/work/${item.file}.jpg`}
                    preload="auto"
                    muted
                    loop
                    playsInline
                  />
                  <div data-glass-carousel-content="" className="glass-carousel__item-content">
                    <h3 className="glass-carousel__item-p">{item.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div aria-live="polite" data-glass-carousel-caption="" className="glass-carousel__caption" />
          <div data-glass-carousel-counter="" className="glass-carousel__counter" />
        </section>

        <section id="contact" className="section-footer">
          <div className="padding-global is-full">
            <div className="footer-base">
              <div className="padding-medium">
                <div data-reveal-group="" className="flex-horizontal space-between is-stretch">
                  <h6><O>{profile.company}</O></h6>
                  <h6><O>Portfolio 2026</O></h6>
                </div>
              </div>
              <div className="footer-last">
                <div className="padding-medium">
                  <div className="margin-bottom margin-small">
                    <div data-reveal-group="" className="flex-horizontal space-between is-stretch">
                      <div className="flex-vertical gap-s">
                        <div className="flex-vertical">
                          <h6><O>Name</O></h6>
                          <span className="heading-style-h6">{profile.name}</span>
                        </div>
                        <div className="flex-vertical">
                          <h6><O>Company</O></h6>
                          <span className="heading-style-h6">{profile.company}</span>
                        </div>
                      </div>
                      <div className="flex-vertical gap-s">
                        <div className="flex-vertical">
                          <h6 className="text-align-right"><O>Availability</O></h6>
                          <span className="heading-style-h6 text-align-right">Freelance</span>
                        </div>
                        <div className="flex-vertical">
                          <h6 className="text-align-right"><O>Timezone</O></h6>
                          <span className="heading-style-h6 text-align-right">GMT+5:30</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="line" />
                </div>
                <div
                  data-marquee-duplicate="2"
                  data-marquee-scroll-direction-target=""
                  data-marquee-direction="left"
                  data-marquee-speed="15"
                  data-marquee-scroll-speed="10"
                  className="marquee-advanced"
                >
                  <div data-marquee-scroll-target="" className="marquee-advanced__scroll">
                    <div data-marquee-collection-target="" className="marquee-advanced__collection">
                      <div className="marquee-advanced__item">
                        <h3 className="marquee-text">
                          <O>{profile.name}</O>
                          <span className="text-color-orange">.AGP</span>
                        </h3>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="t-shape">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${ASSETS}/logo.png`} alt="" width={269} height={92} />
              </div>
              <div className="footer-gradient" />
            </div>
          </div>
        </section>

        <div className="cursor-wrap">
          <div data-cursor-dot="" className="cursor-dot" />
          <canvas data-cursor-canvas="" className="cursor-canvas" />
        </div>
      </div>
    </div>
  );
}
