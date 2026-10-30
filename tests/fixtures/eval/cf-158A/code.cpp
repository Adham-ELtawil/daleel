#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n, k; cin >> n >> k;
    vector<int> scores(n);
    for (int &score : scores) cin >> score;
    int count = 0;
    for (int score : scores)
        if (score >= scores[k - 1]) ++count;
    cout << count << '\n';
}
