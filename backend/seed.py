import csv
import io
import os
import urllib.request
from backend.database import SessionLocal, engine, Base
from backend.models import Problem, TopicMastery, Attempt, SpacedRepetition, DailyActivity, BadgeTest, CompanyMetadata

SEED_DATA = {
  "topics": [
    {
      "name": "Arrays",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Two Sum",
              "slug": "two-sum"
            },
            {
              "title": "Best Time to Buy and Sell Stock",
              "slug": "best-time-to-buy-and-sell-stock"
            },
            {
              "title": "Majority Element",
              "slug": "majority-element"
            },
            {
              "title": "Move Zeroes",
              "slug": "move-zeroes"
            },
            {
              "title": "Plus One",
              "slug": "plus-one"
            },
            {
              "title": "Merge Sorted Array",
              "slug": "merge-sorted-array"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Product of Array Except Self",
              "slug": "product-of-array-except-self"
            },
            {
              "title": "3Sum",
              "slug": "3sum"
            },
            {
              "title": "Rotate Array",
              "slug": "rotate-array"
            },
            {
              "title": "Spiral Matrix",
              "slug": "spiral-matrix"
            },
            {
              "title": "Set Matrix Zeroes",
              "slug": "set-matrix-zeroes"
            },
            {
              "title": "Insert Interval",
              "slug": "insert-interval"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Subarray Sum Equals K",
              "slug": "subarray-sum-equals-k"
            },
            {
              "title": "Next Permutation",
              "slug": "next-permutation"
            },
            {
              "title": "Sort Colors",
              "slug": "sort-colors"
            },
            {
              "title": "Find All Duplicates in an Array",
              "slug": "find-all-duplicates-in-an-array"
            },
            {
              "title": "Maximum Product Subarray",
              "slug": "maximum-product-subarray"
            },
            {
              "title": "3Sum Closest",
              "slug": "3sum-closest"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Merge Intervals",
              "slug": "merge-intervals"
            },
            {
              "title": "Trapping Rain Water",
              "slug": "trapping-rain-water"
            },
            {
              "title": "Container With Most Water",
              "slug": "container-with-most-water"
            },
            {
              "title": "Jump Game II",
              "slug": "jump-game-ii"
            },
            {
              "title": "Longest Consecutive Sequence",
              "slug": "longest-consecutive-sequence"
            },
            {
              "title": "Sliding Window Maximum",
              "slug": "sliding-window-maximum"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "First Missing Positive",
              "slug": "first-missing-positive"
            },
            {
              "title": "Median of Two Sorted Arrays",
              "slug": "median-of-two-sorted-arrays"
            },
            {
              "title": "Count of Smaller Numbers After Self",
              "slug": "count-of-smaller-numbers-after-self"
            },
            {
              "title": "Maximum Gap",
              "slug": "maximum-gap"
            },
            {
              "title": "Reverse Pairs",
              "slug": "reverse-pairs"
            },
            {
              "title": "Merge k Sorted Lists",
              "slug": "merge-k-sorted-lists"
            }
          ]
        }
      ]
    },
    {
      "name": "Strings",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Valid Anagram",
              "slug": "valid-anagram"
            },
            {
              "title": "Reverse String",
              "slug": "reverse-string"
            },
            {
              "title": "Valid Palindrome",
              "slug": "valid-palindrome"
            },
            {
              "title": "First Unique Character in a String",
              "slug": "first-unique-character-in-a-string"
            },
            {
              "title": "Ransom Note",
              "slug": "ransom-note"
            },
            {
              "title": "Roman to Integer",
              "slug": "roman-to-integer"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Longest Substring Without Repeating Characters",
              "slug": "longest-substring-without-repeating-characters"
            },
            {
              "title": "Group Anagrams",
              "slug": "group-anagrams"
            },
            {
              "title": "Zigzag Conversion",
              "slug": "zigzag-conversion"
            },
            {
              "title": "Multiply Strings",
              "slug": "multiply-strings"
            },
            {
              "title": "Letter Combinations of a Phone Number",
              "slug": "letter-combinations-of-a-phone-number"
            },
            {
              "title": "String to Integer (atoi)",
              "slug": "string-to-integer-atoi"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Longest Palindromic Substring",
              "slug": "longest-palindromic-substring"
            },
            {
              "title": "Palindromic Substrings",
              "slug": "palindromic-substrings"
            },
            {
              "title": "Count and Say",
              "slug": "count-and-say"
            },
            {
              "title": "Compare Version Numbers",
              "slug": "compare-version-numbers"
            },
            {
              "title": "Simplify Path",
              "slug": "simplify-path"
            },
            {
              "title": "Decode String",
              "slug": "decode-string"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Decode Ways",
              "slug": "decode-ways"
            },
            {
              "title": "Minimum Window Substring",
              "slug": "minimum-window-substring"
            },
            {
              "title": "Longest Valid Parentheses",
              "slug": "longest-valid-parentheses"
            },
            {
              "title": "Edit Distance",
              "slug": "edit-distance"
            },
            {
              "title": "Integer to English Words",
              "slug": "integer-to-english-words"
            },
            {
              "title": "Text Justification",
              "slug": "text-justification"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Regular Expression Matching",
              "slug": "regular-expression-matching"
            },
            {
              "title": "Wildcard Matching",
              "slug": "wildcard-matching"
            },
            {
              "title": "Distinct Subsequences",
              "slug": "distinct-subsequences"
            },
            {
              "title": "Scramble String",
              "slug": "scramble-string"
            },
            {
              "title": "Longest Valid Parentheses",
              "slug": "longest-valid-parentheses"
            },
            {
              "title": "Word Break II",
              "slug": "word-break-ii"
            }
          ]
        }
      ]
    },
    {
      "name": "Sliding Window & Two Pointers",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Valid Palindrome",
              "slug": "valid-palindrome"
            },
            {
              "title": "Contains Duplicate II",
              "slug": "contains-duplicate-ii"
            },
            {
              "title": "Remove Duplicates from Sorted Array",
              "slug": "remove-duplicates-from-sorted-array"
            },
            {
              "title": "Backspace String Compare",
              "slug": "backspace-string-compare"
            },
            {
              "title": "Squares of a Sorted Array",
              "slug": "squares-of-a-sorted-array"
            },
            {
              "title": "Two Sum II - Input Array Is Sorted",
              "slug": "two-sum-ii-input-array-is-sorted"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Container With Most Water",
              "slug": "container-with-most-water"
            },
            {
              "title": "Longest Repeating Character Replacement",
              "slug": "longest-repeating-character-replacement"
            },
            {
              "title": "Max Consecutive Ones III",
              "slug": "max-consecutive-ones-iii"
            },
            {
              "title": "Subarray Product Less Than K",
              "slug": "subarray-product-less-than-k"
            },
            {
              "title": "Sort Colors",
              "slug": "sort-colors"
            },
            {
              "title": "3Sum",
              "slug": "3sum"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Permutation in String",
              "slug": "permutation-in-string"
            },
            {
              "title": "Find All Anagrams in a String",
              "slug": "find-all-anagrams-in-a-string"
            },
            {
              "title": "Minimum Size Subarray Sum",
              "slug": "minimum-size-subarray-sum"
            },
            {
              "title": "Boats to Save People",
              "slug": "boats-to-save-people"
            },
            {
              "title": "3Sum Closest",
              "slug": "3sum-closest"
            },
            {
              "title": "Longest Substring Without Repeating Characters",
              "slug": "longest-substring-without-repeating-characters"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Fruit Into Baskets",
              "slug": "fruit-into-baskets"
            },
            {
              "title": "Sliding Window Maximum",
              "slug": "sliding-window-maximum"
            },
            {
              "title": "Trapping Rain Water",
              "slug": "trapping-rain-water"
            },
            {
              "title": "Minimum Window Substring",
              "slug": "minimum-window-substring"
            },
            {
              "title": "Subarray Sum Equals K",
              "slug": "subarray-sum-equals-k"
            },
            {
              "title": "Max Points on a Line",
              "slug": "max-points-on-a-line"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Substring with Concatenation of All Words",
              "slug": "substring-with-concatenation-of-all-words"
            },
            {
              "title": "Smallest Range Covering Elements from K Lists",
              "slug": "smallest-range-covering-elements-from-k-lists"
            },
            {
              "title": "Count of Smaller Numbers After Self",
              "slug": "count-of-smaller-numbers-after-self"
            },
            {
              "title": "Split Array Largest Sum",
              "slug": "split-array-largest-sum"
            },
            {
              "title": "First Missing Positive",
              "slug": "first-missing-positive"
            },
            {
              "title": "Median of Two Sorted Arrays",
              "slug": "median-of-two-sorted-arrays"
            }
          ]
        }
      ]
    },
    {
      "name": "Binary Search",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Binary Search",
              "slug": "binary-search"
            },
            {
              "title": "Search Insert Position",
              "slug": "search-insert-position"
            },
            {
              "title": "First Bad Version",
              "slug": "first-bad-version"
            },
            {
              "title": "Sqrt(x)",
              "slug": "sqrtx"
            },
            {
              "title": "Valid Perfect Square",
              "slug": "valid-perfect-square"
            },
            {
              "title": "Guess Number Higher or Lower",
              "slug": "guess-number-higher-or-lower"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Search in Rotated Sorted Array",
              "slug": "search-in-rotated-sorted-array"
            },
            {
              "title": "Find First and Last Position of Element in Sorted Array",
              "slug": "find-first-and-last-position-of-element-in-sorted-array"
            },
            {
              "title": "Find Peak Element",
              "slug": "find-peak-element"
            },
            {
              "title": "Search a 2D Matrix II",
              "slug": "search-a-2d-matrix-ii"
            },
            {
              "title": "Kth Smallest Element in a Sorted Matrix",
              "slug": "kth-smallest-element-in-a-sorted-matrix"
            },
            {
              "title": "Koko Eating Bananas",
              "slug": "koko-eating-bananas"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Find Minimum in Rotated Sorted Array",
              "slug": "find-minimum-in-rotated-sorted-array"
            },
            {
              "title": "Search a 2D Matrix",
              "slug": "search-a-2d-matrix"
            },
            {
              "title": "Search in Rotated Sorted Array II",
              "slug": "search-in-rotated-sorted-array-ii"
            },
            {
              "title": "Find the Duplicate Number",
              "slug": "find-the-duplicate-number"
            },
            {
              "title": "Single Element in a Sorted Array",
              "slug": "single-element-in-a-sorted-array"
            },
            {
              "title": "Capacity To Ship Packages Within D Days",
              "slug": "capacity-to-ship-packages-within-d-days"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Koko Eating Bananas",
              "slug": "koko-eating-bananas"
            },
            {
              "title": "Median of Two Sorted Arrays",
              "slug": "median-of-two-sorted-arrays"
            },
            {
              "title": "Minimum Number of Days to Make m Bouquets",
              "slug": "minimum-number-of-days-to-make-m-bouquets"
            },
            {
              "title": "Capacity To Ship Packages Within D Days",
              "slug": "capacity-to-ship-packages-within-d-days"
            },
            {
              "title": "Search in Rotated Sorted Array II",
              "slug": "search-in-rotated-sorted-array-ii"
            },
            {
              "title": "Find K-th Smallest Pair Distance",
              "slug": "find-k-th-smallest-pair-distance"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Split Array Largest Sum",
              "slug": "split-array-largest-sum"
            },
            {
              "title": "Find K-th Smallest Pair Distance",
              "slug": "find-k-th-smallest-pair-distance"
            },
            {
              "title": "Russian Doll Envelopes",
              "slug": "russian-doll-envelopes"
            },
            {
              "title": "Count of Smaller Numbers After Self",
              "slug": "count-of-smaller-numbers-after-self"
            },
            {
              "title": "Maximum Gap",
              "slug": "maximum-gap"
            },
            {
              "title": "Median of Two Sorted Arrays",
              "slug": "median-of-two-sorted-arrays"
            }
          ]
        }
      ]
    },
    {
      "name": "Linked List",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Reverse Linked List",
              "slug": "reverse-linked-list"
            },
            {
              "title": "Merge Two Sorted Lists",
              "slug": "merge-two-sorted-lists"
            },
            {
              "title": "Linked List Cycle",
              "slug": "linked-list-cycle"
            },
            {
              "title": "Middle of the Linked List",
              "slug": "middle-of-the-linked-list"
            },
            {
              "title": "Palindrome Linked List",
              "slug": "palindrome-linked-list"
            },
            {
              "title": "Remove Linked List Elements",
              "slug": "remove-linked-list-elements"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Add Two Numbers",
              "slug": "add-two-numbers"
            },
            {
              "title": "Remove Nth Node From End of List",
              "slug": "remove-nth-node-from-end-of-list"
            },
            {
              "title": "Odd Even Linked List",
              "slug": "odd-even-linked-list"
            },
            {
              "title": "Rotate List",
              "slug": "rotate-list"
            },
            {
              "title": "Partition List",
              "slug": "partition-list"
            },
            {
              "title": "Swap Nodes in Pairs",
              "slug": "swap-nodes-in-pairs"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Reorder List",
              "slug": "reorder-list"
            },
            {
              "title": "Linked List Cycle II",
              "slug": "linked-list-cycle-ii"
            },
            {
              "title": "Sort List",
              "slug": "sort-list"
            },
            {
              "title": "Add Two Numbers II",
              "slug": "add-two-numbers-ii"
            },
            {
              "title": "Flatten a Multilevel Doubly Linked List",
              "slug": "flatten-a-multilevel-doubly-linked-list"
            },
            {
              "title": "Split Linked List in Parts",
              "slug": "split-linked-list-in-parts"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Copy List with Random Pointer",
              "slug": "copy-list-with-random-pointer"
            },
            {
              "title": "Merge k Sorted Lists",
              "slug": "merge-k-sorted-lists"
            },
            {
              "title": "Reverse Nodes in k-Group",
              "slug": "reverse-nodes-in-k-group"
            },
            {
              "title": "Sort List",
              "slug": "sort-list"
            },
            {
              "title": "LRU Cache",
              "slug": "lru-cache"
            },
            {
              "title": "Remove Duplicates from Sorted List II",
              "slug": "remove-duplicates-from-sorted-list-ii"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Reverse Nodes in k-Group",
              "slug": "reverse-nodes-in-k-group"
            },
            {
              "title": "LFU Cache",
              "slug": "lfu-cache"
            },
            {
              "title": "Merge k Sorted Lists",
              "slug": "merge-k-sorted-lists"
            },
            {
              "title": "Copy List with Random Pointer",
              "slug": "copy-list-with-random-pointer"
            },
            {
              "title": "Design Skiplist",
              "slug": "design-skiplist"
            },
            {
              "title": "All O`one Data Structure",
              "slug": "all-oone-data-structure"
            }
          ]
        }
      ]
    },
    {
      "name": "Stack & Queue",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Valid Parentheses",
              "slug": "valid-parentheses"
            },
            {
              "title": "Implement Queue using Stacks",
              "slug": "implement-queue-using-stacks"
            },
            {
              "title": "Baseball Game",
              "slug": "baseball-game"
            },
            {
              "title": "Remove Outermost Parentheses",
              "slug": "remove-outermost-parentheses"
            },
            {
              "title": "Backspace String Compare",
              "slug": "backspace-string-compare"
            },
            {
              "title": "Next Greater Element I",
              "slug": "next-greater-element-i"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Min Stack",
              "slug": "min-stack"
            },
            {
              "title": "Daily Temperatures",
              "slug": "daily-temperatures"
            },
            {
              "title": "Evaluate Reverse Polish Notation",
              "slug": "evaluate-reverse-polish-notation"
            },
            {
              "title": "Decode String",
              "slug": "decode-string"
            },
            {
              "title": "Online Stock Span",
              "slug": "online-stock-span"
            },
            {
              "title": "Remove K Digits",
              "slug": "remove-k-digits"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Next Greater Element II",
              "slug": "next-greater-element-ii"
            },
            {
              "title": "Asteroid Collision",
              "slug": "asteroid-collision"
            },
            {
              "title": "Simplify Path",
              "slug": "simplify-path"
            },
            {
              "title": "Exclusive Time of Functions",
              "slug": "exclusive-time-of-functions"
            },
            {
              "title": "Car Fleet",
              "slug": "car-fleet"
            },
            {
              "title": "Remove Duplicate Letters",
              "slug": "remove-duplicate-letters"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Asteroid Collision",
              "slug": "asteroid-collision"
            },
            {
              "title": "Largest Rectangle in Histogram",
              "slug": "largest-rectangle-in-histogram"
            },
            {
              "title": "Basic Calculator II",
              "slug": "basic-calculator-ii"
            },
            {
              "title": "Trapping Rain Water",
              "slug": "trapping-rain-water"
            },
            {
              "title": "Sliding Window Maximum",
              "slug": "sliding-window-maximum"
            },
            {
              "title": "Maximal Rectangle",
              "slug": "maximal-rectangle"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Basic Calculator",
              "slug": "basic-calculator"
            },
            {
              "title": "Maximal Rectangle",
              "slug": "maximal-rectangle"
            },
            {
              "title": "Largest Rectangle in Histogram",
              "slug": "largest-rectangle-in-histogram"
            },
            {
              "title": "Trapping Rain Water",
              "slug": "trapping-rain-water"
            },
            {
              "title": "Sliding Window Maximum",
              "slug": "sliding-window-maximum"
            },
            {
              "title": "Remove Duplicate Letters",
              "slug": "remove-duplicate-letters"
            }
          ]
        }
      ]
    },
    {
      "name": "Hashing",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Two Sum",
              "slug": "two-sum"
            },
            {
              "title": "Contains Duplicate",
              "slug": "contains-duplicate"
            },
            {
              "title": "Ransom Note",
              "slug": "ransom-note"
            },
            {
              "title": "Valid Anagram",
              "slug": "valid-anagram"
            },
            {
              "title": "Jewels and Stones",
              "slug": "jewels-and-stones"
            },
            {
              "title": "Intersection of Two Arrays",
              "slug": "intersection-of-two-arrays"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Top K Frequent Elements",
              "slug": "top-k-frequent-elements"
            },
            {
              "title": "4Sum",
              "slug": "4sum"
            },
            {
              "title": "Group Anagrams",
              "slug": "group-anagrams"
            },
            {
              "title": "Subarray Sum Equals K",
              "slug": "subarray-sum-equals-k"
            },
            {
              "title": "Longest Consecutive Sequence",
              "slug": "longest-consecutive-sequence"
            },
            {
              "title": "Contiguous Array",
              "slug": "contiguous-array"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Insert Delete GetRandom O(1)",
              "slug": "insert-delete-getrandom-o1"
            },
            {
              "title": "Top K Frequent Words",
              "slug": "top-k-frequent-words"
            },
            {
              "title": "Brick Wall",
              "slug": "brick-wall"
            },
            {
              "title": "Subarray Sums Divisible by K",
              "slug": "subarray-sums-divisible-by-k"
            },
            {
              "title": "Continuous Subarray Sum",
              "slug": "continuous-subarray-sum"
            },
            {
              "title": "Longest Consecutive Sequence",
              "slug": "longest-consecutive-sequence"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "LRU Cache",
              "slug": "lru-cache"
            },
            {
              "title": "Max Points on a Line",
              "slug": "max-points-on-a-line"
            },
            {
              "title": "Insert Delete GetRandom O(1) - Duplicates Allowed",
              "slug": "insert-delete-getrandom-o1-duplicates-allowed"
            },
            {
              "title": "4Sum II",
              "slug": "4sum-ii"
            },
            {
              "title": "Group Anagrams",
              "slug": "group-anagrams"
            },
            {
              "title": "Subarray Sum Equals K",
              "slug": "subarray-sum-equals-k"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Insert Delete GetRandom O(1) - Duplicates allowed",
              "slug": "insert-delete-getrandom-o1-duplicates-allowed"
            },
            {
              "title": "Text Justification",
              "slug": "text-justification"
            },
            {
              "title": "Max Points on a Line",
              "slug": "max-points-on-a-line"
            },
            {
              "title": "First Missing Positive",
              "slug": "first-missing-positive"
            },
            {
              "title": "LFU Cache",
              "slug": "lfu-cache"
            },
            {
              "title": "Substring with Concatenation of All Words",
              "slug": "substring-with-concatenation-of-all-words"
            }
          ]
        }
      ]
    },
    {
      "name": "Recursion & Backtracking",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Climbing Stairs",
              "slug": "climbing-stairs"
            },
            {
              "title": "Fibonacci Number",
              "slug": "fibonacci-number"
            },
            {
              "title": "Power of Two",
              "slug": "power-of-two"
            },
            {
              "title": "Reverse String",
              "slug": "reverse-string"
            },
            {
              "title": "Merge Two Sorted Lists",
              "slug": "merge-two-sorted-lists"
            },
            {
              "title": "Maximum Depth of Binary Tree",
              "slug": "maximum-depth-of-binary-tree"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Subsets",
              "slug": "subsets"
            },
            {
              "title": "Permutations",
              "slug": "permutations"
            },
            {
              "title": "Combination Sum",
              "slug": "combination-sum"
            },
            {
              "title": "Letter Combinations of a Phone Number",
              "slug": "letter-combinations-of-a-phone-number"
            },
            {
              "title": "Generate Parentheses",
              "slug": "generate-parentheses"
            },
            {
              "title": "Subsets II",
              "slug": "subsets-ii"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Combination Sum",
              "slug": "combination-sum"
            },
            {
              "title": "Generate Parentheses",
              "slug": "generate-parentheses"
            },
            {
              "title": "Permutations II",
              "slug": "permutations-ii"
            },
            {
              "title": "Combination Sum II",
              "slug": "combination-sum-ii"
            },
            {
              "title": "Palindrome Partitioning",
              "slug": "palindrome-partitioning"
            },
            {
              "title": "Letter Case Permutation",
              "slug": "letter-case-permutation"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Word Search",
              "slug": "word-search"
            },
            {
              "title": "N-Queens",
              "slug": "n-queens"
            },
            {
              "title": "Restore IP Addresses",
              "slug": "restore-ip-addresses"
            },
            {
              "title": "Expression Add Operators",
              "slug": "expression-add-operators"
            },
            {
              "title": "Word Break II",
              "slug": "word-break-ii"
            },
            {
              "title": "Palindrome Partitioning II",
              "slug": "palindrome-partitioning-ii"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Sudoku Solver",
              "slug": "sudoku-solver"
            },
            {
              "title": "Word Break II",
              "slug": "word-break-ii"
            },
            {
              "title": "N-Queens II",
              "slug": "n-queens-ii"
            },
            {
              "title": "Expression Add Operators",
              "slug": "expression-add-operators"
            },
            {
              "title": "Remove Invalid Parentheses",
              "slug": "remove-invalid-parentheses"
            },
            {
              "title": "Palindrome Partitioning II",
              "slug": "palindrome-partitioning-ii"
            }
          ]
        }
      ]
    },
    {
      "name": "Trees & BST",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Maximum Depth of Binary Tree",
              "slug": "maximum-depth-of-binary-tree"
            },
            {
              "title": "Same Tree",
              "slug": "same-tree"
            },
            {
              "title": "Invert Binary Tree",
              "slug": "invert-binary-tree"
            },
            {
              "title": "Symmetric Tree",
              "slug": "symmetric-tree"
            },
            {
              "title": "Path Sum",
              "slug": "path-sum"
            },
            {
              "title": "Minimum Depth of Binary Tree",
              "slug": "minimum-depth-of-binary-tree"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Validate Binary Search Tree",
              "slug": "validate-binary-search-tree"
            },
            {
              "title": "Binary Tree Level Order Traversal",
              "slug": "binary-tree-level-order-traversal"
            },
            {
              "title": "Binary Tree Right Side View",
              "slug": "binary-tree-right-side-view"
            },
            {
              "title": "Path Sum II",
              "slug": "path-sum-ii"
            },
            {
              "title": "Lowest Common Ancestor of a Binary Tree",
              "slug": "lowest-common-ancestor-of-a-binary-tree"
            },
            {
              "title": "Diameter of Binary Tree",
              "slug": "diameter-of-binary-tree"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Lowest Common Ancestor of a Binary Search Tree",
              "slug": "lowest-common-ancestor-of-a-binary-search-tree"
            },
            {
              "title": "Kth Smallest Element in a BST",
              "slug": "kth-smallest-element-in-a-bst"
            },
            {
              "title": "Flatten Binary Tree to Linked List",
              "slug": "flatten-binary-tree-to-linked-list"
            },
            {
              "title": "Populating Next Right Pointers in Each Node",
              "slug": "populating-next-right-pointers-in-each-node"
            },
            {
              "title": "Binary Tree Zigzag Level Order Traversal",
              "slug": "binary-tree-zigzag-level-order-traversal"
            },
            {
              "title": "Delete Node in a BST",
              "slug": "delete-node-in-a-bst"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Construct Binary Tree from Preorder and Inorder Traversal",
              "slug": "construct-binary-tree-from-preorder-and-inorder-traversal"
            },
            {
              "title": "Binary Tree Maximum Path Sum",
              "slug": "binary-tree-maximum-path-sum"
            },
            {
              "title": "House Robber III",
              "slug": "house-robber-iii"
            },
            {
              "title": "Count Complete Tree Nodes",
              "slug": "count-complete-tree-nodes"
            },
            {
              "title": "Unique Binary Search Trees II",
              "slug": "unique-binary-search-trees-ii"
            },
            {
              "title": "Vertical Order Traversal of a Binary Tree",
              "slug": "vertical-order-traversal-of-a-binary-tree"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Serialize and Deserialize Binary Tree",
              "slug": "serialize-and-deserialize-binary-tree"
            },
            {
              "title": "Binary Tree Cameras",
              "slug": "binary-tree-cameras"
            },
            {
              "title": "Recover Binary Search Tree",
              "slug": "recover-binary-search-tree"
            },
            {
              "title": "Maximum Sum BST in Binary Tree",
              "slug": "maximum-sum-bst-in-binary-tree"
            },
            {
              "title": "Binary Tree Maximum Path Sum",
              "slug": "binary-tree-maximum-path-sum"
            },
            {
              "title": "Vertical Order Traversal of a Binary Tree",
              "slug": "vertical-order-traversal-of-a-binary-tree"
            }
          ]
        }
      ]
    },
    {
      "name": "Heaps / Priority Queue",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Kth Largest Element in a Stream",
              "slug": "kth-largest-element-in-a-stream"
            },
            {
              "title": "Last Stone Weight",
              "slug": "last-stone-weight"
            },
            {
              "title": "Relative Ranks",
              "slug": "relative-ranks"
            },
            {
              "title": "Maximum Product of Two Elements in an Array",
              "slug": "maximum-product-of-two-elements-in-an-array"
            },
            {
              "title": "Height Checker",
              "slug": "height-checker"
            },
            {
              "title": "Sort Array by Increasing Frequency",
              "slug": "sort-array-by-increasing-frequency"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Kth Largest Element in an Array",
              "slug": "kth-largest-element-in-an-array"
            },
            {
              "title": "K Closest Points to Origin",
              "slug": "k-closest-points-to-origin"
            },
            {
              "title": "Top K Frequent Elements",
              "slug": "top-k-frequent-elements"
            },
            {
              "title": "Sort Characters By Frequency",
              "slug": "sort-characters-by-frequency"
            },
            {
              "title": "Single-Threaded CPU",
              "slug": "single-threaded-cpu"
            },
            {
              "title": "Car Pooling",
              "slug": "car-pooling"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Task Scheduler",
              "slug": "task-scheduler"
            },
            {
              "title": "Reorganize String",
              "slug": "reorganize-string"
            },
            {
              "title": "Top K Frequent Words",
              "slug": "top-k-frequent-words"
            },
            {
              "title": "Ugly Number II",
              "slug": "ugly-number-ii"
            },
            {
              "title": "Minimum Number of Refueling Stops",
              "slug": "minimum-number-of-refueling-stops"
            },
            {
              "title": "Single-Threaded CPU",
              "slug": "single-threaded-cpu"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "IPO",
              "slug": "ipo"
            },
            {
              "title": "Find Median from Data Stream",
              "slug": "find-median-from-data-stream"
            },
            {
              "title": "Merge k Sorted Lists",
              "slug": "merge-k-sorted-lists"
            },
            {
              "title": "Kth Smallest Element in a Sorted Matrix",
              "slug": "kth-smallest-element-in-a-sorted-matrix"
            },
            {
              "title": "Task Scheduler",
              "slug": "task-scheduler"
            },
            {
              "title": "The Skyline Problem",
              "slug": "the-skyline-problem"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Smallest Range Covering Elements from K Lists",
              "slug": "smallest-range-covering-elements-from-k-lists"
            },
            {
              "title": "Maximum Performance of a Team",
              "slug": "maximum-performance-of-a-team"
            },
            {
              "title": "The Skyline Problem",
              "slug": "the-skyline-problem"
            },
            {
              "title": "Minimum Cost to Hire K Workers",
              "slug": "minimum-cost-to-hire-k-workers"
            },
            {
              "title": "Merge k Sorted Lists",
              "slug": "merge-k-sorted-lists"
            },
            {
              "title": "Find Median from Data Stream",
              "slug": "find-median-from-data-stream"
            }
          ]
        }
      ]
    },
    {
      "name": "Graphs",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Find if Path Exists in Graph",
              "slug": "find-if-path-exists-in-graph"
            },
            {
              "title": "Flood Fill",
              "slug": "flood-fill"
            },
            {
              "title": "Island Perimeter",
              "slug": "island-perimeter"
            },
            {
              "title": "Find Center of Star Graph",
              "slug": "find-center-of-star-graph"
            },
            {
              "title": "Verifying an Alien Dictionary",
              "slug": "verifying-an-alien-dictionary"
            },
            {
              "title": "Number of Provinces",
              "slug": "number-of-provinces"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Number of Islands",
              "slug": "number-of-islands"
            },
            {
              "title": "Clone Graph",
              "slug": "clone-graph"
            },
            {
              "title": "Course Schedule",
              "slug": "course-schedule"
            },
            {
              "title": "Rotting Oranges",
              "slug": "rotting-oranges"
            },
            {
              "title": "Surrounded Regions",
              "slug": "surrounded-regions"
            },
            {
              "title": "Is Graph Bipartite?",
              "slug": "is-graph-bipartite"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Course Schedule",
              "slug": "course-schedule"
            },
            {
              "title": "Pacific Atlantic Water Flow",
              "slug": "pacific-atlantic-water-flow"
            },
            {
              "title": "All Paths From Source to Target",
              "slug": "all-paths-from-source-to-target"
            },
            {
              "title": "Evaluate Division",
              "slug": "evaluate-division"
            },
            {
              "title": "Redundant Connection",
              "slug": "redundant-connection"
            },
            {
              "title": "Minimum Height Trees",
              "slug": "minimum-height-trees"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Course Schedule II",
              "slug": "course-schedule-ii"
            },
            {
              "title": "Word Ladder",
              "slug": "word-ladder"
            },
            {
              "title": "Network Delay Time",
              "slug": "network-delay-time"
            },
            {
              "title": "Cheapest Flights Within K Stops",
              "slug": "cheapest-flights-within-k-stops"
            },
            {
              "title": "Path With Minimum Effort",
              "slug": "path-with-minimum-effort"
            },
            {
              "title": "Accounts Merge",
              "slug": "accounts-merge"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Swim in Rising Water",
              "slug": "swim-in-rising-water"
            },
            {
              "title": "Reconstruct Itinerary",
              "slug": "reconstruct-itinerary"
            },
            {
              "title": "Cheapest Flights Within K Stops",
              "slug": "cheapest-flights-within-k-stops"
            },
            {
              "title": "Critical Connections in a Network",
              "slug": "critical-connections-in-a-network"
            },
            {
              "title": "Word Ladder II",
              "slug": "word-ladder-ii"
            },
            {
              "title": "Bus Routes",
              "slug": "bus-routes"
            }
          ]
        }
      ]
    },
    {
      "name": "Dynamic Programming",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "House Robber",
              "slug": "house-robber"
            },
            {
              "title": "Maximum Subarray",
              "slug": "maximum-subarray"
            },
            {
              "title": "Climbing Stairs",
              "slug": "climbing-stairs"
            },
            {
              "title": "Min Cost Climbing Stairs",
              "slug": "min-cost-climbing-stairs"
            },
            {
              "title": "Best Time to Buy and Sell Stock",
              "slug": "best-time-to-buy-and-sell-stock"
            },
            {
              "title": "Range Sum Query - Immutable",
              "slug": "range-sum-query-immutable"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Coin Change",
              "slug": "coin-change"
            },
            {
              "title": "Longest Increasing Subsequence",
              "slug": "longest-increasing-subsequence"
            },
            {
              "title": "Unique Paths",
              "slug": "unique-paths"
            },
            {
              "title": "House Robber II",
              "slug": "house-robber-ii"
            },
            {
              "title": "Decode Ways",
              "slug": "decode-ways"
            },
            {
              "title": "Partition Equal Subset Sum",
              "slug": "partition-equal-subset-sum"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Unique Paths",
              "slug": "unique-paths"
            },
            {
              "title": "Word Break",
              "slug": "word-break"
            },
            {
              "title": "Longest Palindromic Subsequence",
              "slug": "longest-palindromic-subsequence"
            },
            {
              "title": "Coin Change II",
              "slug": "coin-change-ii"
            },
            {
              "title": "Target Sum",
              "slug": "target-sum"
            },
            {
              "title": "Maximum Length of Repeated Subarray",
              "slug": "maximum-length-of-repeated-subarray"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Longest Common Subsequence",
              "slug": "longest-common-subsequence"
            },
            {
              "title": "Palindrome Partitioning II",
              "slug": "palindrome-partitioning-ii"
            },
            {
              "title": "Edit Distance",
              "slug": "edit-distance"
            },
            {
              "title": "Interleaving String",
              "slug": "interleaving-string"
            },
            {
              "title": "Maximal Square",
              "slug": "maximal-square"
            },
            {
              "title": "Unique Binary Search Trees",
              "slug": "unique-binary-search-trees"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Burst Balloons",
              "slug": "burst-balloons"
            },
            {
              "title": "Distinct Subsequences",
              "slug": "distinct-subsequences"
            },
            {
              "title": "Regular Expression Matching",
              "slug": "regular-expression-matching"
            },
            {
              "title": "Wildcard Matching",
              "slug": "wildcard-matching"
            },
            {
              "title": "Scramble String",
              "slug": "scramble-string"
            },
            {
              "title": "Dungeon Game",
              "slug": "dungeon-game"
            }
          ]
        }
      ]
    },
    {
      "name": "Greedy",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Assign Cookies",
              "slug": "assign-cookies"
            },
            {
              "title": "Lemonade Change",
              "slug": "lemonade-change"
            },
            {
              "title": "Best Time to Buy and Sell Stock",
              "slug": "best-time-to-buy-and-sell-stock"
            },
            {
              "title": "Is Subsequence",
              "slug": "is-subsequence"
            },
            {
              "title": "Can Place Flowers",
              "slug": "can-place-flowers"
            },
            {
              "title": "Largest Perimeter Triangle",
              "slug": "largest-perimeter-triangle"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Jump Game",
              "slug": "jump-game"
            },
            {
              "title": "Gas Station",
              "slug": "gas-station"
            },
            {
              "title": "Minimum Number of Arrows to Burst Balloons",
              "slug": "minimum-number-of-arrows-to-burst-balloons"
            },
            {
              "title": "Non-overlapping Intervals",
              "slug": "non-overlapping-intervals"
            },
            {
              "title": "Two City Scheduling",
              "slug": "two-city-scheduling"
            },
            {
              "title": "Boats to Save People",
              "slug": "boats-to-save-people"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Jump Game II",
              "slug": "jump-game-ii"
            },
            {
              "title": "Partition Labels",
              "slug": "partition-labels"
            },
            {
              "title": "Task Scheduler",
              "slug": "task-scheduler"
            },
            {
              "title": "Remove K Digits",
              "slug": "remove-k-digits"
            },
            {
              "title": "Video Stitching",
              "slug": "video-stitching"
            },
            {
              "title": "Non-overlapping Intervals",
              "slug": "non-overlapping-intervals"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Queue Reconstruction by Height",
              "slug": "queue-reconstruction-by-height"
            },
            {
              "title": "Candy",
              "slug": "candy"
            },
            {
              "title": "Minimum Number of Taps to Open to Water a Garden",
              "slug": "minimum-number-of-taps-to-open-to-water-a-garden"
            },
            {
              "title": "Course Schedule III",
              "slug": "course-schedule-iii"
            },
            {
              "title": "Patching Array",
              "slug": "patching-array"
            },
            {
              "title": "IPO",
              "slug": "ipo"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Create Maximum Number",
              "slug": "create-maximum-number"
            },
            {
              "title": "Split Array into Consecutive Subsequences",
              "slug": "split-array-into-consecutive-subsequences"
            },
            {
              "title": "Candy",
              "slug": "candy"
            },
            {
              "title": "Patching Array",
              "slug": "patching-array"
            },
            {
              "title": "Maximum Performance of a Team",
              "slug": "maximum-performance-of-a-team"
            },
            {
              "title": "IPO",
              "slug": "ipo"
            }
          ]
        }
      ]
    },
    {
      "name": "Trie & Bit Manipulation",
      "badges": [
        {
          "level": 1,
          "badge": "Bronze",
          "difficulty": "Easy",
          "questions": [
            {
              "title": "Implement Trie (Prefix Tree)",
              "slug": "implement-trie-prefix-tree"
            },
            {
              "title": "Single Number",
              "slug": "single-number"
            },
            {
              "title": "Number of 1 Bits",
              "slug": "number-of-1-bits"
            },
            {
              "title": "Hamming Distance",
              "slug": "hamming-distance"
            },
            {
              "title": "Power of Two",
              "slug": "power-of-two"
            },
            {
              "title": "Missing Number",
              "slug": "missing-number"
            }
          ]
        },
        {
          "level": 2,
          "badge": "Silver",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Design Add and Search Words Data Structure",
              "slug": "design-add-and-search-words-data-structure"
            },
            {
              "title": "Counting Bits",
              "slug": "counting-bits"
            },
            {
              "title": "Single Number II",
              "slug": "single-number-ii"
            },
            {
              "title": "Sum of Two Integers",
              "slug": "sum-of-two-integers"
            },
            {
              "title": "Replace Words",
              "slug": "replace-words"
            },
            {
              "title": "Longest Word in Dictionary",
              "slug": "longest-word-in-dictionary"
            }
          ]
        },
        {
          "level": 3,
          "badge": "Gold",
          "difficulty": "Medium",
          "questions": [
            {
              "title": "Map Sum Pairs",
              "slug": "map-sum-pairs"
            },
            {
              "title": "Maximum XOR of Two Numbers in an Array",
              "slug": "maximum-xor-of-two-numbers-in-an-array"
            },
            {
              "title": "Single Number III",
              "slug": "single-number-iii"
            },
            {
              "title": "Bitwise AND of Numbers Range",
              "slug": "bitwise-and-of-numbers-range"
            },
            {
              "title": "Word Search",
              "slug": "word-search"
            },
            {
              "title": "Sum of Two Integers",
              "slug": "sum-of-two-integers"
            }
          ]
        },
        {
          "level": 4,
          "badge": "Platinum",
          "difficulty": "Medium/Hard",
          "questions": [
            {
              "title": "Word Search II",
              "slug": "word-search-ii"
            },
            {
              "title": "Concatenated Words",
              "slug": "concatenated-words"
            },
            {
              "title": "Maximum XOR With an Element From Array",
              "slug": "maximum-xor-with-an-element-from-array"
            },
            {
              "title": "Short Encoding of Words",
              "slug": "short-encoding-of-words"
            },
            {
              "title": "Stream of Characters",
              "slug": "stream-of-characters"
            },
            {
              "title": "Single Number III",
              "slug": "single-number-iii"
            }
          ]
        },
        {
          "level": 5,
          "badge": "Diamond",
          "difficulty": "Hard",
          "questions": [
            {
              "title": "Palindrome Pairs",
              "slug": "palindrome-pairs"
            },
            {
              "title": "Design Search Autocomplete System",
              "slug": "design-search-autocomplete-system"
            },
            {
              "title": "Word Squares",
              "slug": "word-squares"
            },
            {
              "title": "Count Different Palindromic Subsequences",
              "slug": "count-different-palindromic-subsequences"
            },
            {
              "title": "Maximum XOR With an Element From Array",
              "slug": "maximum-xor-with-an-element-from-array"
            },
            {
              "title": "Stream of Characters",
              "slug": "stream-of-characters"
            }
          ]
        }
      ]
    }
  ]
}

COMPANIES_DATA = {
  "companies": [
    {
      "name": "Google",
      "questions": [
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Word Search II", "slug": "word-search-ii", "difficulty": "Hard" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Amazon",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" },
        { "title": "Trapping Rain Water", "slug": "trapping-rain-water", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Microsoft",
      "questions": [
        { "title": "Reverse Linked List", "slug": "reverse-linked-list", "difficulty": "Easy" },
        { "title": "Copy List with Random Pointer", "slug": "copy-list-with-random-pointer", "difficulty": "Medium" },
        { "title": "Serialize and Deserialize Binary Tree", "slug": "serialize-and-deserialize-binary-tree", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Meta",
      "questions": [
        { "title": "Valid Palindrome II", "slug": "valid-palindrome-ii", "difficulty": "Easy" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Binary Tree Maximum Path Sum", "slug": "binary-tree-maximum-path-sum", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Apple",
      "questions": [
        { "title": "Merge Two Sorted Lists", "slug": "merge-two-sorted-lists", "difficulty": "Easy" },
        { "title": "Kth Largest Element in an Array", "slug": "kth-largest-element-in-an-array", "difficulty": "Medium" },
        { "title": "Design Circular Queue", "slug": "design-circular-queue", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Adobe",
      "questions": [
        { "title": "Word Break", "slug": "word-break", "difficulty": "Medium" },
        { "title": "Lowest Common Ancestor of a Binary Tree", "slug": "lowest-common-ancestor-of-a-binary-tree", "difficulty": "Medium" },
        { "title": "Trapping Rain Water", "slug": "trapping-rain-water", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Uber",
      "questions": [
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Flipkart",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Rotate Array", "slug": "rotate-array", "difficulty": "Medium" },
        { "title": "Longest Palindromic Substring", "slug": "longest-palindromic-substring", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Goldman Sachs",
      "questions": [
        { "title": "Search in Rotated Sorted Array", "slug": "search-in-rotated-sorted-array", "difficulty": "Medium" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Longest Common Subsequence", "slug": "longest-common-subsequence", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Atlassian",
      "questions": [
        { "title": "Group Anagrams", "slug": "group-anagrams", "difficulty": "Medium" },
        { "title": "Course Schedule II", "slug": "course-schedule-ii", "difficulty": "Medium" },
        { "title": "Design Add and Search Words Data Structure", "slug": "design-add-and-search-words-data-structure", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Salesforce",
      "questions": [
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Clone Graph", "slug": "clone-graph", "difficulty": "Medium" },
        { "title": "Word Ladder", "slug": "word-ladder", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Walmart Labs",
      "questions": [
        { "title": "Linked List Cycle", "slug": "linked-list-cycle", "difficulty": "Easy" },
        { "title": "Subarray Sum Equals K", "slug": "subarray-sum-equals-k", "difficulty": "Medium" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Sabre",
      "focus_note": "Travel/booking-systems SDE round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Couchbase",
      "focus_note": "Distributed-systems/QE round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Implement Trie (Prefix Tree)", "slug": "implement-trie-prefix-tree", "difficulty": "Medium" },
        { "title": "Design Twitter", "slug": "design-twitter", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Oracle",
      "questions": [
        { "title": "Binary Search", "slug": "binary-search", "difficulty": "Easy" },
        { "title": "Add Two Numbers", "slug": "add-two-numbers", "difficulty": "Medium" },
        { "title": "Longest Substring Without Repeating Characters", "slug": "longest-substring-without-repeating-characters", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Cisco",
      "questions": [
        { "title": "Rotting Oranges", "slug": "rotting-oranges", "difficulty": "Medium" },
        { "title": "Design Circular Queue", "slug": "design-circular-queue", "difficulty": "Medium" },
        { "title": "Network Delay Time", "slug": "network-delay-time", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Intuit",
      "questions": [
        { "title": "Product of Array Except Self", "slug": "product-of-array-except-self", "difficulty": "Medium" },
        { "title": "Coin Change", "slug": "coin-change", "difficulty": "Medium" },
        { "title": "Minimum Window Substring", "slug": "minimum-window-substring", "difficulty": "Hard" }
      ]
    },
    {
      "name": "ServiceNow",
      "questions": [
        { "title": "Design Circular Queue", "slug": "design-circular-queue", "difficulty": "Medium" },
        { "title": "Task Scheduler", "slug": "task-scheduler", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" }
      ]
    },
    {
      "name": "PayPal",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Best Time to Buy and Sell Stock", "slug": "best-time-to-buy-and-sell-stock", "difficulty": "Easy" },
        { "title": "Design Underground System", "slug": "design-underground-system", "difficulty": "Medium" },
        { "title": "Longest Substring Without Repeating Characters", "slug": "longest-substring-without-repeating-characters", "difficulty": "Medium" },
        { "title": "Merge Two Sorted Lists", "slug": "merge-two-sorted-lists", "difficulty": "Easy" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Reverse Linked List", "slug": "reverse-linked-list", "difficulty": "Easy" },
        { "title": "Coin Change", "slug": "coin-change", "difficulty": "Medium" }
      ]
    },
    {
      "name": "VMware",
      "questions": [
        { "title": "Merge k Sorted Lists", "slug": "merge-k-sorted-lists", "difficulty": "Hard" },
        { "title": "Design Circular Deque", "slug": "design-circular-deque", "difficulty": "Medium" },
        { "title": "Redundant Connection", "slug": "redundant-connection", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Qualcomm",
      "questions": [
        { "title": "Reverse Bits", "slug": "reverse-bits", "difficulty": "Easy" },
        { "title": "Single Number", "slug": "single-number", "difficulty": "Easy" },
        { "title": "Sliding Window Maximum", "slug": "sliding-window-maximum", "difficulty": "Hard" },
        { "title": "Counting Bits", "slug": "counting-bits", "difficulty": "Easy" },
        { "title": "Rotate Image", "slug": "rotate-image", "difficulty": "Medium" },
        { "title": "Power of Two", "slug": "power-of-two", "difficulty": "Easy" }
      ]
    },
    {
      "name": "Samsung",
      "questions": [
        { "title": "Rotate Image", "slug": "rotate-image", "difficulty": "Medium" },
        { "title": "Spiral Matrix", "slug": "spiral-matrix", "difficulty": "Medium" },
        { "title": "Set Matrix Zeroes", "slug": "set-matrix-zeroes", "difficulty": "Medium" },
        { "title": "Word Search", "slug": "word-search", "difficulty": "Medium" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Zoho",
      "focus_note": "Freshers-round pattern proxy, common data structure and string questions",
      "questions": [
        { "title": "Valid Anagram", "slug": "valid-anagram", "difficulty": "Easy" },
        { "title": "Reverse Words in a String", "slug": "reverse-words-in-a-string", "difficulty": "Medium" },
        { "title": "Implement Stack using Queues", "slug": "implement-stack-using-queues", "difficulty": "Easy" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Remove Duplicates from Sorted Array", "slug": "remove-duplicates-from-sorted-array", "difficulty": "Easy" },
        { "title": "Move Zeroes", "slug": "move-zeroes", "difficulty": "Easy" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Reverse Linked List", "slug": "reverse-linked-list", "difficulty": "Easy" },
        { "title": "Longest Common Prefix", "slug": "longest-common-prefix", "difficulty": "Easy" },
        { "title": "Sort Colors", "slug": "sort-colors", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Freshworks",
      "focus_note": "SDE-1 freshers round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Group Anagrams", "slug": "group-anagrams", "difficulty": "Medium" },
        { "title": "Longest Consecutive Sequence", "slug": "longest-consecutive-sequence", "difficulty": "Medium" },
        { "title": "Word Break", "slug": "word-break", "difficulty": "Medium" },
        { "title": "Valid Anagram", "slug": "valid-anagram", "difficulty": "Easy" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Swiggy",
      "focus_note": "SDE freshers round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Design Twitter", "slug": "design-twitter", "difficulty": "Medium" },
        { "title": "K Closest Points to Origin", "slug": "k-closest-points-to-origin", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" },
        { "title": "Subarray Sum Equals K", "slug": "subarray-sum-equals-k", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Zomato",
      "focus_note": "SDE freshers round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Find Median from Data Stream", "slug": "find-median-from-data-stream", "difficulty": "Hard" },
        { "title": "K Closest Points to Origin", "slug": "k-closest-points-to-origin", "difficulty": "Medium" },
        { "title": "Subarray Sum Equals K", "slug": "subarray-sum-equals-k", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" }
      ]
    },
    {
      "name": "Paytm",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Longest Substring Without Repeating Characters", "slug": "longest-substring-without-repeating-characters", "difficulty": "Medium" },
        { "title": "Coin Change", "slug": "coin-change", "difficulty": "Medium" },
        { "title": "Maximum Subarray", "slug": "maximum-subarray", "difficulty": "Medium" },
        { "title": "3Sum", "slug": "3sum", "difficulty": "Medium" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Reverse Linked List", "slug": "reverse-linked-list", "difficulty": "Easy" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" }
      ]
    },
    {
      "name": "PhonePe",
      "focus_note": "SDE freshers/off-campus round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "3Sum", "slug": "3sum", "difficulty": "Medium" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" },
        { "title": "Word Ladder", "slug": "word-ladder", "difficulty": "Hard" },
        { "title": "Subarray Sum Equals K", "slug": "subarray-sum-equals-k", "difficulty": "Medium" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" }
      ]
    },
    {
      "name": "Razorpay",
      "focus_note": "SDE round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Design Parking System", "slug": "design-parking-system", "difficulty": "Easy" },
        { "title": "Top K Frequent Elements", "slug": "top-k-frequent-elements", "difficulty": "Medium" },
        { "title": "Course Schedule II", "slug": "course-schedule-ii", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Merge Intervals", "slug": "merge-intervals", "difficulty": "Medium" }
      ]
    },
    {
      "name": "LinkedIn",
      "questions": [
        { "title": "Random Pick with Weight", "slug": "random-pick-with-weight", "difficulty": "Medium" },
        { "title": "Insert Delete GetRandom O(1)", "slug": "insert-delete-getrandom-o1", "difficulty": "Medium" },
        { "title": "Word Ladder", "slug": "word-ladder", "difficulty": "Hard" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Max Points on a Line", "slug": "max-points-on-a-line", "difficulty": "Hard" }
      ]
    },
    {
      "name": "Bloomberg",
      "questions": [
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "K Closest Points to Origin", "slug": "k-closest-points-to-origin", "difficulty": "Medium" },
        { "title": "Time Based Key-Value Store", "slug": "time-based-key-value-store", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Two City Scheduling", "slug": "two-city-scheduling", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Nutanix",
      "focus_note": "SDE freshers round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Design Circular Queue", "slug": "design-circular-queue", "difficulty": "Medium" },
        { "title": "LFU Cache", "slug": "lfu-cache", "difficulty": "Hard" },
        { "title": "Number of Islands", "slug": "number-of-islands", "difficulty": "Medium" },
        { "title": "Course Schedule", "slug": "course-schedule", "difficulty": "Medium" },
        { "title": "LRU Cache", "slug": "lru-cache", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Intel",
      "focus_note": "SDE freshers round proxy, not confirmed company-tagged data",
      "questions": [
        { "title": "Reverse Integer", "slug": "reverse-integer", "difficulty": "Medium" },
        { "title": "Counting Bits", "slug": "counting-bits", "difficulty": "Easy" },
        { "title": "Maximum Subarray", "slug": "maximum-subarray", "difficulty": "Medium" },
        { "title": "Single Number", "slug": "single-number", "difficulty": "Easy" },
        { "title": "Reverse Bits", "slug": "reverse-bits", "difficulty": "Easy" }
      ]
    },
    {
      "name": "TCS Digital",
      "focus_note": "Off-campus/campus digital hiring round proxy, common patterns not confirmed company-tagged data",
      "questions": [
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Merge Two Sorted Lists", "slug": "merge-two-sorted-lists", "difficulty": "Easy" },
        { "title": "Longest Palindromic Substring", "slug": "longest-palindromic-substring", "difficulty": "Medium" },
        { "title": "Valid Palindrome", "slug": "valid-palindrome", "difficulty": "Easy" },
        { "title": "Reverse String", "slug": "reverse-string", "difficulty": "Easy" },
        { "title": "Valid Anagram", "slug": "valid-anagram", "difficulty": "Easy" },
        { "title": "Climbing Stairs", "slug": "climbing-stairs", "difficulty": "Easy" },
        { "title": "Maximum Subarray", "slug": "maximum-subarray", "difficulty": "Medium" },
        { "title": "Best Time to Buy and Sell Stock", "slug": "best-time-to-buy-and-sell-stock", "difficulty": "Easy" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Linked List Cycle", "slug": "linked-list-cycle", "difficulty": "Easy" },
        { "title": "Longest Common Prefix", "slug": "longest-common-prefix", "difficulty": "Easy" },
        { "title": "Remove Duplicates from Sorted Array", "slug": "remove-duplicates-from-sorted-array", "difficulty": "Easy" },
        { "title": "Move Zeroes", "slug": "move-zeroes", "difficulty": "Easy" },
        { "title": "Single Number", "slug": "single-number", "difficulty": "Easy" },
        { "title": "Majority Element", "slug": "majority-element", "difficulty": "Easy" },
        { "title": "3Sum", "slug": "3sum", "difficulty": "Medium" },
        { "title": "Container With Most Water", "slug": "container-with-most-water", "difficulty": "Medium" },
        { "title": "Product of Array Except Self", "slug": "product-of-array-except-self", "difficulty": "Medium" },
        { "title": "Group Anagrams", "slug": "group-anagrams", "difficulty": "Medium" },
        { "title": "Coin Change", "slug": "coin-change", "difficulty": "Medium" },
        { "title": "Longest Substring Without Repeating Characters", "slug": "longest-substring-without-repeating-characters", "difficulty": "Medium" },
        { "title": "Search in Rotated Sorted Array", "slug": "search-in-rotated-sorted-array", "difficulty": "Medium" },
        { "title": "Sort Colors", "slug": "sort-colors", "difficulty": "Medium" },
        { "title": "Rotate Image", "slug": "rotate-image", "difficulty": "Medium" },
        { "title": "Spiral Matrix", "slug": "spiral-matrix", "difficulty": "Medium" },
        { "title": "House Robber", "slug": "house-robber", "difficulty": "Medium" },
        { "title": "Word Break", "slug": "word-break", "difficulty": "Medium" }
      ]
    },
    {
      "name": "Cognizant",
      "focus_note": "Campus GenC round proxy, common patterns not confirmed company-tagged data",
      "questions": [
        { "title": "Valid Anagram", "slug": "valid-anagram", "difficulty": "Easy" },
        { "title": "Reverse Linked List", "slug": "reverse-linked-list", "difficulty": "Easy" },
        { "title": "Maximum Depth of Binary Tree", "slug": "maximum-depth-of-binary-tree", "difficulty": "Easy" },
        { "title": "Two Sum", "slug": "two-sum", "difficulty": "Easy" },
        { "title": "Climbing Stairs", "slug": "climbing-stairs", "difficulty": "Easy" },
        { "title": "Valid Palindrome", "slug": "valid-palindrome", "difficulty": "Easy" },
        { "title": "Reverse String", "slug": "reverse-string", "difficulty": "Easy" },
        { "title": "Merge Two Sorted Lists", "slug": "merge-two-sorted-lists", "difficulty": "Easy" },
        { "title": "Valid Parentheses", "slug": "valid-parentheses", "difficulty": "Easy" },
        { "title": "Linked List Cycle", "slug": "linked-list-cycle", "difficulty": "Easy" }
      ]
    }
  ]
}

def get_company_slug(name):
    mapping = {
        "Meta": "meta",
        "Goldman Sachs": "goldman-sachs",
        "Walmart Labs": "walmart-labs",
        "TCS Digital": "tcs",
    }
    if name in mapping:
        return mapping[name]
    return name.lower().replace(" ", "-")

def fetch_company_csv_from_github(company_slug):
    url = f"https://raw.githubusercontent.com/snehasishroy/leetcode-companywise-interview-questions/master/{company_slug}/all.csv"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return None

def parse_company_csv(csv_data):
    # CSV fields: ID,URL,Title,Difficulty,Acceptance %,Frequency %,Is Premium
    f = io.StringIO(csv_data)
    reader = csv.DictReader(f)
    questions = []
    for row in reader:
        url = row.get('URL', '').strip()
        slug = url.split('/')[-1] if url else None
        if not slug:
            slug = row.get('Title', '').lower().replace(' ', '-')
        
        difficulty = row.get('Difficulty', 'Medium').strip()
        if difficulty not in ["Easy", "Medium", "Hard"]:
            difficulty = "Medium"

        is_prem_raw = str(row.get('Is Premium', row.get('Paid Only', row.get('is_paid_only', row.get('Is Paid', ''))))).strip().lower()
        is_premium = is_prem_raw in ['1', 'true', 'yes', 'y']

        questions.append({
            'slug': slug.strip(),
            'title': row.get('Title', '').strip(),
            'difficulty': difficulty,
            'url': url if url else f"https://leetcode.com/problems/{slug}/",
            'is_premium': is_premium
        })
    return questions

def seed_db(skip_github: bool = False):
    """Seed the shared problem catalog + company metadata (idempotent, non-destructive).

    Only inserts catalog rows that are missing — it never deletes user data
    (attempts, mastery, etc.) or existing catalog rows, so it is safe to run on
    every deploy. Pass skip_github=True (or set SEED_SKIP_GITHUB=1) to skip the
    per-company GitHub CSV fetch and use the bundled fallback lists — much faster
    and network-free, which matters at container boot.
    """
    if os.getenv("SEED_SKIP_GITHUB", "").lower() in ("1", "true", "yes"):
        skip_github = True
    print(f"Seeding catalog (skip_github={skip_github})...")
    db = SessionLocal()
    try:
        existing_problem_ids = {pid for (pid,) in db.query(Problem.id).all()}
        existing_company_names = {name for (name,) in db.query(CompanyMetadata.name).all()}

        # Fast path: if the catalog already looks fully seeded, skip the (slow,
        # network-bound) rebuild entirely so every boot doesn't re-fetch GitHub.
        # Set SEED_FORCE=1 to override (e.g. to pull newly-published questions).
        forced = os.getenv("SEED_FORCE", "").lower() in ("1", "true", "yes")
        if len(existing_problem_ids) >= 300 and not forced:
            print(f"Catalog already seeded ({len(existing_problem_ids)} problems); skipping.")
            return

        # 1. Parse base problems from the 14-topic JSON data structure
        problems_dict = {}
        unique_topics = set()
        
        for topic in SEED_DATA["topics"]:
            topic_name = topic["name"]
            unique_topics.add(topic_name)
            
            for badge in topic["badges"]:
                level = badge["level"]
                for idx, q in enumerate(badge["questions"]):
                    slug = q["slug"]
                    title = q["title"]
                    
                    # Map level & order to appropriate DB difficulty
                    if level == 1:
                        assigned_diff = "Easy"
                    elif level in [2, 3]:
                        assigned_diff = "Medium"
                    elif level == 5:
                        assigned_diff = "Hard"
                    elif level == 4:
                        assigned_diff = "Medium" if idx == 0 else "Hard"
                    else:
                        assigned_diff = "Medium"
                    
                    if slug not in problems_dict:
                        problems_dict[slug] = {
                            "id": slug,
                            "title": title,
                            "url": f"https://leetcode.com/problems/{slug}/",
                            "difficulty": assigned_diff,
                            "topics": {topic_name},
                            "companies": set(),
                            "is_premium": q.get("is_premium", False)
                        }
                    else:
                        problems_dict[slug]["topics"].add(topic_name)

        print(f"Parsed {len(problems_dict)} unique base topic problems.")

        # 2. Add Company Metadata and fetch dynamic GitHub questions
        print("Processing company-specific questions (GitHub fetch & local fallback)...")
        for comp in COMPANIES_DATA["companies"]:
            comp_name = comp["name"]
            focus_note = comp.get("focus_note")
            
            # Save focus note metadata (only if not already present)
            if comp_name not in existing_company_names:
                db.add(CompanyMetadata(name=comp_name, focus_note=focus_note))
                existing_company_names.add(comp_name)

            # Try to fetch additional questions from GitHub repo (unless skipping network)
            slug = get_company_slug(comp_name)
            csv_data = None if skip_github else fetch_company_csv_from_github(slug)
            questions_to_load = []

            if csv_data:
                try:
                    questions_to_load = parse_company_csv(csv_data)
                    print(f" -> Fetched {len(questions_to_load)} questions from GitHub for {comp_name}")
                except Exception as ex:
                    print(f" -> Error parsing CSV for {comp_name}, falling back: {ex}")
                    csv_data = None

            if not csv_data:
                # Fallback to local hardcoded questions list
                for q in comp["questions"]:
                    questions_to_load.append({
                        'slug': q['slug'],
                        'title': q['title'],
                        'difficulty': q['difficulty'],
                        'url': f"https://leetcode.com/problems/{q['slug']}/",
                        'is_premium': q.get('is_premium', False)
                    })
                print(f" -> Using local fallback list ({len(questions_to_load)} questions) for {comp_name}")

            # Register questions into problems dict
            for q_data in questions_to_load:
                q_slug = q_data['slug']
                if q_slug in problems_dict:
                    problems_dict[q_slug]["companies"].add(comp_name)
                    if q_data.get('is_premium'):
                        problems_dict[q_slug]["is_premium"] = True
                else:
                    def infer_topic(slug, title):
                        text = (slug + " " + title).lower()
                        if any(w in text for w in ["tree", "bst", "trie", "inorder", "preorder", "postorder", "subtree", "ancestor", "path sum"]):
                            return "Trees"
                        if any(w in text for w in ["graph", "island", "course-schedule", "network", "clone-graph", "alien", "dijkstra", "bipartite", "cheapest-flight", "swim", "ladder", "provinces", "rotting", "surrounded"]):
                            return "Graphs"
                        if any(w in text for w in ["dynamic-programming", "coin-change", "climbing-stairs", "house-robber", "longest-increasing", "knapsack", "edit-distance", "decode-ways", "partition", "target-sum", "jump-game", "unique-paths", "maximal", "interleaving", "fibonacci", "longest-common", "regex", "burst", "stock", "word-break"]):
                            return "Dynamic Programming"
                        if any(w in text for w in ["backtrack", "n-queens", "sudoku", "permutation", "combination", "subset", "generate-parentheses", "word-search", "palindrome-partitioning", "letter-combinations"]):
                            return "Backtracking"
                        if any(w in text for w in ["linked-list", "reverse-list", "merge-two-sorted-lists", "remove-nth", "reorder-list", "copy-list", "add-two-numbers", "lru", "lfu", "middle-of-the-linked-list", "delete-node", "swap-nodes", "flatten", "intersection-of-two-linked-lists", "rotate-list"]):
                            return "Linked List"
                        if any(w in text for w in ["stack", "parentheses", "evaluate-reverse", "daily-temperatures", "car-fleet", "largest-rectangle", "min-stack", "asteroid", "decode-string", "next-greater"]):
                            return "Stack"
                        if any(w in text for w in ["binary-search", "search-in-rotated", "find-minimum-in-rotated", "search-a-2d", "koko-eating", "time-based", "median-of-two", "first-bad", "peak", "capacity-to-ship"]):
                            return "Binary Search"
                        if any(w in text for w in ["sliding-window", "minimum-window", "longest-substring", "permutation-in-string", "sliding-window-maximum", "longest-repeating", "fruit-into-baskets", "max-consecutive"]):
                            return "Sliding Window"
                        if any(w in text for w in ["heap", "priority-queue", "kth-largest", "top-k", "merge-k-sorted", "find-median-from-data", "task-scheduler", "k-closest", "reorganize-string"]):
                            return "Heap / Priority Queue"
                        if any(w in text for w in ["two-pointers", "3sum", "container-with-most-water", "trapping-rain-water", "valid-palindrome", "two-sum-ii", "remove-duplicates", "move-zeroes", "sort-colors", "4sum"]):
                            return "Two Pointers"
                        if any(w in text for w in ["intervals", "merge-intervals", "insert-interval", "non-overlapping", "meeting-rooms", "erase-overlap", "interval-list"]):
                            return "Intervals"
                        if any(w in text for w in ["greedy", "gas-station", "hand-of-straights", "partition-labels", "valid-parenthesis-string", "candy", "lemonade", "assign-cookies"]):
                            return "Greedy"
                        if any(w in text for w in ["bit", "single-number", "number-of-1-bits", "counting-bits", "reverse-bits", "missing-number", "sum-of-two-integers", "bitwise", "xor"]):
                            return "Bit Manipulation"
                        if any(w in text for w in ["math", "geometry", "rotate-image", "spiral-matrix", "set-matrix-zeroes", "happy-number", "plus-one", "pow", "multiply-strings", "detect-squares"]):
                            return "Math & Geometry"
                        if any(w in text for w in ["string", "anagram", "palindrome", "roman", "integer-to-roman", "zigzag", "group-anagrams"]):
                            return "Strings"
                        return "Arrays"

                    inferred = infer_topic(q_slug, q_data['title'])
                    problems_dict[q_slug] = {
                        "id": q_slug,
                        "title": q_data['title'],
                        "url": q_data['url'],
                        "difficulty": q_data['difficulty'],
                        "topics": {inferred},
                        "companies": {comp_name},
                        "is_premium": q_data.get('is_premium', False)
                    }

        # Seed Problems (insert only those missing from the catalog)
        inserted = 0
        for p_id, p_data in problems_dict.items():
            if p_id in existing_problem_ids:
                continue
            prob = Problem(
                id=p_id,
                title=p_data["title"],
                url=p_data["url"],
                difficulty=p_data["difficulty"],
                topics=",".join(sorted(list(p_data["topics"]))),
                companies=",".join(sorted(list(p_data["companies"]))) if p_data["companies"] else None,
                is_premium=p_data.get("is_premium", False)
            )
            db.add(prob)
            inserted += 1
        print(f"Inserting {inserted} new problems into catalog...")

        # NOTE: TopicMastery is per-user now (multi-tenant). It is created on
        # demand per user (e.g. GET /topics/mastery seeds the 14 standard topics
        # for the calling user), so seeding is catalog-only here.

        db.commit()
        print("Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during database seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
