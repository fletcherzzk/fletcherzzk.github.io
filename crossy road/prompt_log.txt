Model used: Chatgpt6-astra 
(Interesting note: 24% of total weekly usage for chatgpt plus is used for this project)



1 build something in **JavaScript** that mimics Crossy Road as closely as you can, inluding the chunky, blocky, pseudo-3D camera angle. 
That 2.5D look is a big part of what makes Crossy Road feel like Crossy Road.&#x20;

### Core Requirements

- **It's a playable browser game.** Written in JavaScript, running as a static page. 
   Someone visiting the URL should be able to play it without installing anything.
- **It works on GitHub Pages.** That means plain HTML/CSS/JS with **no build step** and **no server**.
   If you use a library, either link to it with a `<script src="https://...">` tag pointing at a hosted copy (a "CDN"), or download the library's file and commit it into your folder yourself. 
   (If your project requires `npm run build` before it works, it will not work on Pages, so fix that before you submit.)
- **It's recognizably Crossy Road.** A character that moves forward across lanes, hazards that can end your run, and a score that goes up the further you get, at minimum.

Try your best!







prompt 2:
There are following  problems with the current version of the game.

1 The player should face the back of the character, I don't like the side view.

2 The design of the character, trees, vehicles should be made better. You can make them look like being made of lego blocks.

3 remove the music icon and music function.





prompt3:
Make the following changes:

1 make the design better, make everything looks really like build with real lego

2 add a timer that tells the player will be defeated without moving forward for 5 seconds

3 make the fonts larger and more visible






prompt4:
These are the remaining problems:

1 The building block the grid of the grass and the raft should be the same size as the building blocks of the chicken

2 The window shields of the cars do not look right

3 the vehicles can be moving 15% faster, and a bit less dense



prompt 5:
You should make the following improvements:

1 The standing point of chicken should align with the lego grids on the grass and raft

2 there shouldn't be a left or right border where chicken cannot move further to the left or right.&#x20;

3 Make the wheels of the vehicles actually spin

before you start, are the instructions clear?



prompt 6:
The following changes can be made:

1 The player cannot trick the timer by moving backward and then forward, the timer should only reset when the players distance increases.

2 There are some random white spots on grass, could you fix that

Are these instructions clear? tell me if they are hard to implement




