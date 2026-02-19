
def extractive_summary(text: str, num_sentences: int = 3) -> str:
    sentences = text.replace("\n", " ").split(". ")
    scored = []
    words = text.lower().split()
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    for s in sentences:
        score = sum(freq.get(w.lower(), 0) for w in s.split())
        scored.append((score, s))
    scored.sort(reverse=True)
    top = [s for _, s in scored[:num_sentences]]
    return ". ".join(top) + "."
