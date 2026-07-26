package nl.oslife.walktracker.walks

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import nl.oslife.walktracker.R
import java.util.concurrent.Executors

/** Card list of recent tracked walks — tap one to see its route on a map. */
class WalksListActivity : AppCompatActivity() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var emptyText: TextView
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_walks_list)

        findViewById<View>(R.id.backButton).setOnClickListener { finish() }
        recyclerView = findViewById(R.id.walksRecyclerView)
        emptyText = findViewById(R.id.emptyText)
        recyclerView.layoutManager = LinearLayoutManager(this)

        loadWalks()
    }

    private fun loadWalks() {
        executor.execute {
            val walks = WalkRepository.fetchRecentWalks(this)
            WalkCache.set(walks)
            runOnUiThread { render(walks) }
        }
    }

    private fun render(walks: List<Walk>) {
        if (walks.isEmpty()) {
            emptyText.visibility = View.VISIBLE
            recyclerView.visibility = View.GONE
            return
        }
        emptyText.visibility = View.GONE
        recyclerView.visibility = View.VISIBLE
        recyclerView.adapter = WalkAdapter(walks) { walk ->
            startActivity(Intent(this, WalkDetailActivity::class.java).putExtra(WalkDetailActivity.EXTRA_WALK_ID, walk.id))
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
