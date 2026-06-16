# Python Loops and Lists

## The for loop

A `for` loop in Python repeats a block of code once for each item in a sequence,
such as a list or a range of numbers. You write `for item in sequence:` and then
indent the body. The loop variable takes the value of each element in turn until
the sequence is exhausted.

For example, looping over a list of names lets you print a greeting for every
person without writing the print statement many times.

## List comprehension

A list comprehension is a short way to build a new list from an existing
sequence in a single line. The form is `[expression for item in sequence]`. It
runs the expression for every item and collects the results into a new list.

For example, `[n * n for n in numbers]` produces a new list containing the square
of every number in `numbers`. It replaces a longer for-loop that appends to a
list one item at a time.
