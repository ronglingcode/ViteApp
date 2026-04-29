for gap and go setup, add a field to the config as runnerCount. i split my partials into 10 pieces (batchCount is 10). so each piece is 10% of the entire position when this runnerCount is 5, that means when i have 50% positions left, i cannot take early exits by lowering targets or raising stops, until one of the conditions triggers. for now, one of the conditions is when the clock is 10 minutes after market open. that will force me to hold my core positions like this 50% until the trade has enough time to develop.



i have tradebooks like gap_and_go, gap_and_crap. for each tradebook, they can have multiple entry patterns, like bookmap breakout, bookmap      
breakdown, bookmap reversal. and different tradebooks can share the same patterns. how do i design the code? there are some trading rules that  
are specific to a tradebook, there are some rules specific to a pattern. you can look at my code now, it's mixing the concept of tradebook and  
patterns. how can i reorganize it. 